import { Env } from '../index';
import { PandaScoreClient, Match, Game, Team, TournamentStanding } from '../pandascore';
import { getDb } from '../db/utils';
import { Subscriber } from '../db/utils';
import { Telegraf } from 'telegraf';
import { formatMatchTime, getTimezoneAbbreviation } from '../utils/timezone';
import { escapeHtml } from '../utils/html';

const UPCOMING_CRON = '*/15 * * * *';

interface SubscriberMaps {
    teamIdToSubscriberIds: Map<number, Set<number>>;
    subscriberIdToTelegramId: Map<number, number>;
    allSubscribers: Subscriber[];
    uniqueTeamIds: number[];
}

async function buildSubscriberMaps(env: Env): Promise<SubscriberMaps | null> {
    const db = getDb(env);
    const allSubscriptions = await db.getAllSubscriptions();
    const allSubscribers = await db.getAllSubscribers();

    if (allSubscriptions.length === 0) {
        console.log('No subscriptions found. Exiting.');
        return null;
    }

    const subscriberIdToTelegramId = new Map<number, number>();
    for (const sub of allSubscribers) {
        subscriberIdToTelegramId.set(sub.id, sub.telegramId);
    }

    const teamIdToSubscriberIds = new Map<number, Set<number>>();
    for (const sub of allSubscriptions) {
        if (!teamIdToSubscriberIds.has(sub.teamId)) {
            teamIdToSubscriberIds.set(sub.teamId, new Set<number>());
        }
        teamIdToSubscriberIds.get(sub.teamId)?.add(sub.subscriberId);
    }

    return {
        teamIdToSubscriberIds,
        subscriberIdToTelegramId,
        allSubscribers,
        uniqueTeamIds: Array.from(teamIdToSubscriberIds.keys()),
    };
}

function getTelegramIdsForMatch(
    match: Match,
    maps: SubscriberMaps,
): number[] {
    const telegramIds = new Set<number>();
    for (const { opponent } of match.opponents) {
        const subscriberIds = maps.teamIdToSubscriberIds.get(opponent.id);
        if (subscriberIds) {
            for (const subId of subscriberIds) {
                const telegramId = maps.subscriberIdToTelegramId.get(subId);
                if (telegramId) telegramIds.add(telegramId);
            }
        }
    }
    return Array.from(telegramIds);
}

function formatSeriesScore(match: Match): string {
    const team1 = match.opponents[0]?.opponent;
    const team2 = match.opponents[1]?.opponent;
    if (!team1 || !team2) return '';
    let score1 = 0;
    let score2 = 0;
    for (const g of match.games || []) {
        if (g.status === 'finished' && g.winner) {
            if (g.winner.id === team1.id) score1++;
            else if (g.winner.id === team2.id) score2++;
        }
    }
    return `${escapeHtml(team1.name)} ${score1} – ${score2} ${escapeHtml(team2.name)}`;
}

function formatMapResultMessage(match: Match, game: Game): string {
    const team1 = escapeHtml(match.opponents[0]?.opponent.name || 'TBD');
    const team2 = escapeHtml(match.opponents[1]?.opponent.name || 'TBD');
    const winnerName = escapeHtml(match.opponents.find(o => o.opponent.id === game.winner?.id)?.opponent.name || 'Unknown');
    const seriesScore = formatSeriesScore(match);
    const league = escapeHtml(match.league.name);
    const serie = escapeHtml(match.serie.full_name);

    return `\
🎮 <b>Map ${game.position} Result</b>

<b>${team1}</b> vs <b>${team2}</b>
✅ <b>${winnerName}</b> wins Map ${game.position}!
📊 Series: ${seriesScore}

🏆 ${league} - ${serie}`;
}

function formatFinalResultMessage(match: Match): string {
    const team1 = match.opponents[0]?.opponent;
    const team2 = match.opponents[1]?.opponent;
    const team1Name = escapeHtml(team1?.name || 'TBD');
    const team2Name = escapeHtml(team2?.name || 'TBD');
    const winnerName = escapeHtml(match.winner?.name || 'Unknown');
    let score1 = 0;
    let score2 = 0;
    for (const g of match.games || []) {
        if (g.status === 'finished' && g.winner?.id) {
            if (g.winner.id === team1?.id) score1++;
            else if (g.winner.id === team2?.id) score2++;
        }
    }
    const league = escapeHtml(match.league.name);
    const serie = escapeHtml(match.serie.full_name);

    return `\
🏁 <b>Match Over</b>

<b>${team1Name}</b> vs <b>${team2Name}</b>
🏆 <b>${winnerName}</b> wins the series ${score1}–${score2}!

🏆 ${league} - ${serie}`;
}

function formatTournamentResultMessage(
    teamName: string,
    tournamentName: string,
    isChampion: boolean,
    rank: number,
): string {
    const escapedTeamName = escapeHtml(teamName);
    const escapedTournamentName = escapeHtml(tournamentName);

    if (isChampion) {
        return `\
🏆 <b>Champions!</b>

<b>${escapedTeamName}</b> won the tournament!

🎉 ${escapedTournamentName}`;
    }

    return `\
🥊 <b>Tournament Result</b>

<b>${escapedTeamName}</b> finished in place #${rank}.

🏆 ${escapedTournamentName}`;
}

async function announceTournamentResults(
    env: Env,
    bot: Telegraf,
    pandaScoreClient: PandaScoreClient,
    match: Match,
    maps: SubscriberMaps,
    standingsCache: Map<number, TournamentStanding[] | null>,
): Promise<void> {
    const tournamentId = match.tournament_id;
    const tournament = match.tournament;
    if (!tournamentId || !tournament) return;

    const subscribedTeams: Team[] = match.opponents
        .map(o => o.opponent)
        .filter(team => maps.teamIdToSubscriberIds.has(team.id));
    if (subscribedTeams.length === 0) return;

    if (!standingsCache.has(tournamentId)) {
        try {
            const standings = await pandaScoreClient.getTournamentStandings(tournamentId);
            standingsCache.set(tournamentId, standings);
        } catch (e) {
            console.error(`[tournament] Failed to fetch standings for tournament ${tournamentId}:`, e);
            standingsCache.set(tournamentId, null);
        }
    }
    const standings = standingsCache.get(tournamentId);
    if (!standings) return;

    for (const team of subscribedTeams) {
        const kvKey = `tournament_result_${tournamentId}_${team.id}`;
        const alreadyNotified = await env.NOTIFICATIONS_KV.get(kvKey);
        if (alreadyNotified) continue;

        const entry = standings.find(s => s.team.id === team.id);
        if (!entry) continue;

        const isChampion = tournament.winner_id === team.id;
        const isBracketElimination =
            'last_match' in entry &&
            entry.last_match?.id === match.id &&
            match.winner?.id !== team.id;
        /*
         * Group/round-robin standings have no last_match to key off of, so fall
         * back to the tournament's own end date to know the placement is final.
         */
        const isGroupStageConcluded =
            !('last_match' in entry) &&
            !!tournament.end_at &&
            new Date(tournament.end_at).getTime() <= Date.now();

        if (!isChampion && !isBracketElimination && !isGroupStageConcluded) continue;

        const message = formatTournamentResultMessage(team.name, tournament.name, isChampion, entry.rank);
        const subscriberIds = maps.teamIdToSubscriberIds.get(team.id) || new Set<number>();
        for (const subId of subscriberIds) {
            const telegramId = maps.subscriberIdToTelegramId.get(subId);
            if (!telegramId) continue;
            try {
                await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'HTML' });
            } catch (e) {
                console.error(`[tournament] Failed to send result to ${telegramId}:`, e);
            }
        }

        await env.NOTIFICATIONS_KV.put(kvKey, 'true', { expirationTtl: 2592000 });
        console.log(`[tournament] Notified result for team ${team.id} in tournament ${tournamentId}`);
    }
}

async function processFinishedMatches(
    env: Env,
    bot: Telegraf,
    pandaScoreClient: PandaScoreClient,
    maps: SubscriberMaps,
): Promise<void> {
    const finishedMatches = await pandaScoreClient.getRecentlyFinishedMatches(maps.uniqueTeamIds);
    console.log(`[finished] Found ${finishedMatches.length} recently finished matches`);
    const standingsCache = new Map<number, TournamentStanding[] | null>();

    for (let match of finishedMatches) {
        const kvKey = `match_final_${match.id}`;
        const alreadyNotified = await env.NOTIFICATIONS_KV.get(kvKey);
        if (alreadyNotified) continue;

        if (!match.winner?.id) {
            console.log(`[finished] Winner not yet available for match ${match.id}, re-fetching...`);
            try {
                match = await pandaScoreClient.getMatchById(match.id);
            } catch (e) {
                console.error(`[finished] Re-fetch failed for match ${match.id}:`, e);
            }
            if (!match.winner?.id) {
                console.log(`[finished] Still no winner for match ${match.id}, skipping until next run`);
                continue;
            }
        }

        const telegramIds = getTelegramIdsForMatch(match, maps);
        const message = formatFinalResultMessage(match);

        for (const telegramId of telegramIds) {
            try {
                await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'HTML' });
            } catch (e) {
                console.error(`[finished] Failed to send final result to ${telegramId}:`, e);
            }
        }

        await env.NOTIFICATIONS_KV.put(kvKey, 'true', { expirationTtl: 86400 });
        console.log(`[finished] Notified final result for match ${match.id}`);

        await announceTournamentResults(env, bot, pandaScoreClient, match, maps, standingsCache);
    }
}

async function processLiveMatches(
    env: Env,
    bot: Telegraf,
    pandaScoreClient: PandaScoreClient,
    maps: SubscriberMaps,
): Promise<void> {
    const runningMatches = await pandaScoreClient.getRunningMatches(maps.uniqueTeamIds);
    console.log(`[live] Found ${runningMatches.length} running matches`);

    for (const match of runningMatches) {
        const finishedGames = (match.games || []).filter(
            (g: Game) => g.status === 'finished' && g.winner?.id != null,
        );

        for (const game of finishedGames) {
            const kvKey = `game_${match.id}_${game.id}`;
            const alreadyNotified = await env.NOTIFICATIONS_KV.get(kvKey);
            if (alreadyNotified) continue;

            const telegramIds = getTelegramIdsForMatch(match, maps);
            const message = formatMapResultMessage(match, game);

            for (const telegramId of telegramIds) {
                try {
                    await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'HTML' });
                } catch (e) {
                    console.error(`[live] Failed to send map result to ${telegramId}:`, e);
                }
            }

            await env.NOTIFICATIONS_KV.put(kvKey, 'true', { expirationTtl: 86400 });
            console.log(`[live] Notified map ${game.position} result for match ${match.id}`);
        }
    }
}

async function processUpcomingMatches(
    env: Env,
    bot: Telegraf,
    pandaScoreClient: PandaScoreClient,
    maps: SubscriberMaps,
): Promise<void> {
    const matches: Match[] = await pandaScoreClient.getUpcomingMatches(maps.uniqueTeamIds);
    console.log(`[upcoming] Found ${matches.length} upcoming matches`);

    for (const match of matches) {
        const notificationKey = `match_${match.id}`;
        const notified = await env.NOTIFICATIONS_KV.get(notificationKey);
        if (notified) continue;

        const matchTime = new Date(match.begin_at).getTime();
        const timeUntilMatch = matchTime - Date.now();

        if (timeUntilMatch > 0 && timeUntilMatch <= 1800000) {
            const telegramIds = getTelegramIdsForMatch(match, maps);

            for (const telegramId of telegramIds) {
                try {
                    const subscriber = maps.allSubscribers.find(s => s.telegramId === telegramId);
                    const userTimezone = subscriber?.timezone || 'UTC';
                    const message = formatUpcomingMatchMessage(match, userTimezone);
                    await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'HTML' });
                } catch (e) {
                    console.error(`[upcoming] Failed to send to ${telegramId}:`, e);
                }
            }

            await env.NOTIFICATIONS_KV.put(notificationKey, 'true', { expirationTtl: 86400 });
            console.log(`[upcoming] Notified upcoming match ${match.id}`);
        }
    }
}

function formatUpcomingMatchMessage(match: Match, userTimezone = 'UTC'): string {
    const team1 = escapeHtml(match.opponents[0]?.opponent.name || 'TBD');
    const team2 = escapeHtml(match.opponents[1]?.opponent.name || 'TBD');
    const league = escapeHtml(match.league.name);
    const serie = escapeHtml(match.serie.full_name);

    const matchDate = new Date(match.begin_at);
    const formattedTime = formatMatchTime(match.begin_at, userTimezone);
    const tzAbbr = getTimezoneAbbreviation(matchDate, userTimezone);

    const boInfo = match.number_of_games
        ? `\n🎮 Best of ${match.number_of_games} (BO${match.number_of_games})`
        : '';

    return `\
<b>Upcoming Dota 2 Match!</b>

<b>${team1} vs ${team2}</b>
🗓️ ${formattedTime} ${tzAbbr}${boInfo}
🏆 ${league} - ${serie}`;
}

export async function handleCron(env: Env, cron?: string) {
    console.log(`Cron job started (trigger: ${cron})...`);

    const maps = await buildSubscriberMaps(env);
    if (!maps) return;

    const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);
    const pandaScoreClient = new PandaScoreClient(env);

    if (cron === UPCOMING_CRON) {
        await processUpcomingMatches(env, bot, pandaScoreClient, maps);
    } else {
        await processLiveMatches(env, bot, pandaScoreClient, maps);
        await processFinishedMatches(env, bot, pandaScoreClient, maps);
    }

    console.log('Cron job finished.');
}
