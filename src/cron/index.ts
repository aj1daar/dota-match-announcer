import { Env } from '../index';
import { PandaScoreClient, Match, Game } from '../pandascore';
import { getDb } from '../db/utils';
import { Subscriber } from '../db/utils';
import { Telegraf } from 'telegraf';
import { formatMatchTime, getTimezoneAbbreviation } from '../utils/timezone';

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
    const score1 = match.results.find(r => r.opponent_id === team1.id)?.score ?? 0;
    const score2 = match.results.find(r => r.opponent_id === team2.id)?.score ?? 0;
    return `${team1.name} ${score1} – ${score2} ${team2.name}`;
}

function formatMapResultMessage(match: Match, game: Game): string {
    const team1 = match.opponents[0]?.opponent.name || 'TBD';
    const team2 = match.opponents[1]?.opponent.name || 'TBD';
    const winnerName = game.winner?.name || 'Unknown';
    const seriesScore = formatSeriesScore(match);
    const league = match.league.name;
    const serie = match.serie.full_name;

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
    const team1Name = team1?.name || 'TBD';
    const team2Name = team2?.name || 'TBD';
    const score1 = match.results.find(r => r.opponent_id === team1?.id)?.score ?? 0;
    const score2 = match.results.find(r => r.opponent_id === team2?.id)?.score ?? 0;
    const winnerName = score1 > score2 ? team1Name : team2Name;
    const league = match.league.name;
    const serie = match.serie.full_name;

    return `\
🏁 <b>Match Over</b>

<b>${team1Name}</b> vs <b>${team2Name}</b>
🏆 <b>${winnerName}</b> wins the series ${score1}–${score2}!

🏆 ${league} - ${serie}`;
}

async function processFinishedMatches(
    env: Env,
    bot: Telegraf,
    pandaScoreClient: PandaScoreClient,
    maps: SubscriberMaps,
): Promise<void> {
    const finishedMatches = await pandaScoreClient.getRecentlyFinishedMatches(maps.uniqueTeamIds);
    console.log(`[finished] Found ${finishedMatches.length} recently finished matches`);

    for (const match of finishedMatches) {
        const kvKey = `match_final_${match.id}`;
        const alreadyNotified = await env.NOTIFICATIONS_KV.get(kvKey);
        if (alreadyNotified) continue;

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
            (g: Game) => g.status === 'finished' && g.winner,
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
    const team1 = match.opponents[0]?.opponent.name || 'TBD';
    const team2 = match.opponents[1]?.opponent.name || 'TBD';
    const league = match.league.name;
    const serie = match.serie.full_name;

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
