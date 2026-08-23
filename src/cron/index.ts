import { Env } from '../index';
import { PandaScoreClient, Match, Game, TournamentStanding } from '../pandascore';
import { getDb } from '../db/utils';
import { Subscriber } from '../db/utils';
import { Telegraf } from 'telegraf';
import { formatMatchTime, getTimezoneAbbreviation } from '../utils/timezone';
import { escapeHtml } from '../utils/html';
import { buildIcsCalendar } from '../utils/ics';

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
        // A TBD bracket slot can be a present entry with a null opponent.
        if (!opponent) continue;
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
    const team1 = escapeHtml(match.opponents[0]?.opponent?.name || 'TBD');
    const team2 = escapeHtml(match.opponents[1]?.opponent?.name || 'TBD');
    const winnerName = escapeHtml(match.opponents.find(o => o.opponent?.id === game.winner?.id)?.opponent?.name || 'Unknown');
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

async function hasRemainingTournamentMatches(
    pandaScoreClient: PandaScoreClient,
    teamId: number,
    tournamentId: number,
): Promise<boolean> {
    try {
        const [upcoming, running] = await Promise.all([
            pandaScoreClient.getUpcomingMatches([teamId]),
            pandaScoreClient.getRunningMatches([teamId]),
        ]);
        return [...upcoming, ...running].some(m => m.tournament_id === tournamentId);
    } catch (e) {
        console.error(
            `[tournament] Failed to verify remaining matches for team ${teamId} in tournament ${tournamentId}:`,
            e,
        );
        // Fail safe: if we can't confirm the team is actually done, don't lock in a placement yet.
        return true;
    }
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

    const tournamentEnded = !!tournament.end_at && new Date(tournament.end_at).getTime() <= Date.now();

    /*
     * Scan every entry in the standings, not just the two teams in the match that
     * triggered this call. A team eliminated earlier in the tournament (e.g. in
     * the group stage) never has a last_match that lines up with whatever match
     * just finished, so it can only ever be resolved via the tournament-ended check.
     * That same tournament-ended check also acts as a safety net for a team whose
     * own elimination match was somehow missed (cron downtime, API lag): it isn't
     * tied to !lastMatch, so once the tournament is over, everyone still
     * unresolved gets picked up here instead of staying invisible forever.
     */
    for (const entry of standings) {
        const teamId = entry.team.id;
        if (!maps.teamIdToSubscriberIds.has(teamId)) continue;

        const kvKey = `tournament_result_${tournamentId}_${teamId}`;
        const alreadyNotified = await env.NOTIFICATIONS_KV.get(kvKey);
        if (alreadyNotified) continue;

        const lastMatch = 'last_match' in entry ? entry.last_match : undefined;

        const isChampion = tournament.winner_id === teamId;
        const isBracketElimination =
            !!lastMatch &&
            lastMatch.id === match.id &&
            lastMatch.winner_id !== teamId;
        const isFinalByTournamentEnd = tournamentEnded;

        if (!isChampion && !isBracketElimination && !isFinalByTournamentEnd) continue;

        if (isFinalByTournamentEnd && !isChampion && !isBracketElimination) {
            const stillScheduled = await hasRemainingTournamentMatches(pandaScoreClient, teamId, tournamentId);
            if (stillScheduled) continue;
        }

        const message = formatTournamentResultMessage(entry.team.name, tournament.name, isChampion, entry.rank);
        const subscriberIds = maps.teamIdToSubscriberIds.get(teamId) || new Set<number>();
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
        console.log(`[tournament] Notified result for team ${teamId} in tournament ${tournamentId}`);
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

function isOpponentKnown(match: Match): boolean {
    return match.opponents.length === 2 && !!match.opponents[0]?.opponent && !!match.opponents[1]?.opponent;
}

async function announceNewMatch(
    env: Env,
    bot: Telegraf,
    match: Match,
    maps: SubscriberMaps,
): Promise<void> {
    const opponentKnown = isOpponentKnown(match);
    const knownKey = `match_announced_known_${match.id}`;
    const tbdKey = `match_announced_tbd_${match.id}`;

    if (!opponentKnown) {
        const alreadyNotified = await env.NOTIFICATIONS_KV.get(tbdKey);
        if (alreadyNotified) return;

        await sendToMatchRecipients(env, bot, match, maps, () => formatAdvancingMessage(match));

        await env.NOTIFICATIONS_KV.put(tbdKey, 'true', { expirationTtl: 2592000 });
        console.log(`[upcoming] Announced advancement for match ${match.id} (opponent not yet known)`);
        return;
    }

    const alreadyNotified = await env.NOTIFICATIONS_KV.get(knownKey);
    if (alreadyNotified) return;

    /*
     * If we already told subscribers their team advanced while the opponent was
     * still TBD, this is the follow-up reveal, not a brand new match - the two
     * deserve different framing rather than one dedup key swallowing the second.
     */
    const wasPreviouslyTbd = !!(await env.NOTIFICATIONS_KV.get(tbdKey));
    const title = wasPreviouslyTbd ? '🎭 <b>Opponent Revealed!</b>' : '📢 <b>New Match Scheduled!</b>';
    await sendToMatchRecipients(env, bot, match, maps, (userTimezone) =>
        formatMatchAnnouncement(match, userTimezone, title),
    );

    await env.NOTIFICATIONS_KV.put(knownKey, 'true', { expirationTtl: 2592000 });
    console.log(`[upcoming] Announced match ${match.id} (revealed: ${wasPreviouslyTbd})`);
}

function buildMatchCalendarFile(match: Match): { source: Buffer; filename: string } | null {
    const start = new Date(match.begin_at);
    if (isNaN(start.getTime())) return null;

    const opponentKnown = isOpponentKnown(match);
    const team1 = match.opponents[0]?.opponent?.name;
    const team2 = match.opponents[1]?.opponent?.name;
    const summary = opponentKnown
        ? `${team1} vs ${team2} - ${match.league.name}`
        : `${team1 || team2 || 'Your team'} - Next Match (${match.league.name})`;
    const description = match.number_of_games
        ? `${match.serie.full_name} - Best of ${match.number_of_games}`
        : match.serie.full_name;
    const durationMinutes = match.number_of_games ? match.number_of_games * 60 : 120;

    const ics = buildIcsCalendar({
        uid: `dota-match-${match.id}@dota-match-announcer`,
        summary,
        description,
        start,
        durationMinutes,
    });

    return { source: Buffer.from(ics, 'utf-8'), filename: `match-${match.id}.ics` };
}

async function sendToMatchRecipients(
    env: Env,
    bot: Telegraf,
    match: Match,
    maps: SubscriberMaps,
    buildMessage: (userTimezone: string) => string,
): Promise<void> {
    const telegramIds = getTelegramIdsForMatch(match, maps);
    const calendarFile = buildMatchCalendarFile(match);

    for (const telegramId of telegramIds) {
        try {
            const subscriber = maps.allSubscribers.find(s => s.telegramId === telegramId);
            const userTimezone = subscriber?.timezone || 'UTC';
            const message = buildMessage(userTimezone);
            await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'HTML' });
        } catch (e) {
            console.error(`[upcoming] Failed to send new-match announcement to ${telegramId}:`, e);
        }

        if (calendarFile) {
            try {
                await bot.telegram.sendDocument(telegramId, {
                    source: calendarFile.source,
                    filename: calendarFile.filename,
                });
            } catch (e) {
                console.error(`[upcoming] Failed to send calendar file to ${telegramId}:`, e);
            }
        }
    }
}

async function announceMatchStartingSoon(
    env: Env,
    bot: Telegraf,
    match: Match,
    maps: SubscriberMaps,
): Promise<void> {
    const notificationKey = `match_${match.id}`;
    const notified = await env.NOTIFICATIONS_KV.get(notificationKey);
    if (notified) return;

    const matchTime = new Date(match.begin_at).getTime();
    const timeUntilMatch = matchTime - Date.now();

    if (timeUntilMatch > 0 && timeUntilMatch <= 600000) {
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

async function processUpcomingMatches(
    env: Env,
    bot: Telegraf,
    pandaScoreClient: PandaScoreClient,
    maps: SubscriberMaps,
): Promise<void> {
    const matches: Match[] = await pandaScoreClient.getUpcomingMatches(maps.uniqueTeamIds);
    console.log(`[upcoming] Found ${matches.length} upcoming matches`);

    for (const match of matches) {
        await announceNewMatch(env, bot, match, maps);
        await announceMatchStartingSoon(env, bot, match, maps);
    }
}

function formatAdvancingMessage(match: Match): string {
    const knownTeamName = escapeHtml(
        match.opponents.find(o => o.opponent)?.opponent?.name || 'Your team',
    );
    const league = escapeHtml(match.league.name);
    const serie = escapeHtml(match.serie.full_name);

    return `\
📢 <b>Next Match Locked In!</b>

<b>${knownTeamName}</b> advances to the next round!

🏆 ${league} - ${serie}`;
}

function formatMatchAnnouncement(match: Match, userTimezone: string, title: string): string {
    const team1 = escapeHtml(match.opponents[0]?.opponent?.name || 'TBD');
    const team2 = escapeHtml(match.opponents[1]?.opponent?.name || 'TBD');
    const league = escapeHtml(match.league.name);
    const serie = escapeHtml(match.serie.full_name);

    const matchDate = new Date(match.begin_at);
    const formattedTime = formatMatchTime(match.begin_at, userTimezone);
    const tzAbbr = getTimezoneAbbreviation(matchDate, userTimezone);
    const boInfo = match.number_of_games
        ? `\n🎮 Best of ${match.number_of_games} (BO${match.number_of_games})`
        : '';

    return `\
${title}

<b>${team1} vs ${team2}</b>
🗓️ ${formattedTime} ${tzAbbr}${boInfo}
🏆 ${league} - ${serie}`;
}

function formatUpcomingMatchMessage(match: Match, userTimezone = 'UTC'): string {
    const team1 = escapeHtml(match.opponents[0]?.opponent?.name || 'TBD');
    const team2 = escapeHtml(match.opponents[1]?.opponent?.name || 'TBD');
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

    /*
     * Run on every trigger (both the 1-minute and 15-minute schedules) so a
     * newly scheduled match - e.g. the next round after a team advances - gets
     * announced within a minute of PandaScore publishing it, not up to 15
     * minutes later. Each sub-step is independently deduped via KV, so running
     * it more often than strictly necessary on the 15-minute tick is harmless.
     */
    await processUpcomingMatches(env, bot, pandaScoreClient, maps);
    await processLiveMatches(env, bot, pandaScoreClient, maps);
    await processFinishedMatches(env, bot, pandaScoreClient, maps);

    console.log('Cron job finished.');
}
