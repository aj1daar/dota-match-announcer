import { Env } from '../index';
import { PandaScoreClient, Match } from '../pandascore';
import { getDb } from '../db/utils';
import { Telegraf } from 'telegraf';
export async function handleCron(env: Env, ctx: ExecutionContext) {
    console.log('Cron job started...');

    // Always poll for Telegram updates (runs every minute)
    try {
        await pollTelegramUpdates(env);
    } catch (error) {
        console.error('Error polling Telegram updates:', error);
    }

    // Only run match notifications every 15 minutes
    const lastRunKey = 'last_match_notifications_run';
    const lastRun = await env.NOTIFICATIONS_KV.get(lastRunKey);
    const now = Date.now();
    const fifteenMinutesMs = 15 * 60 * 1000;

    if (lastRun) {
        const lastRunTime = parseInt(lastRun);
        if (now - lastRunTime < fifteenMinutesMs) {
            console.log('Skipping match notifications (ran recently)');
            return;
        }
    }

    console.log('Running match notifications...');
    await env.NOTIFICATIONS_KV.put(lastRunKey, String(now));

    const db = getDb(env);
    const pandaScoreClient = new PandaScoreClient(env);
    const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

    const allSubscriptions = await db.getAllSubscriptions();
    const allSubscribers = await db.getAllSubscribers();

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

    const uniqueTeamIds = Array.from(teamIdToSubscriberIds.keys());

    if (uniqueTeamIds.length === 0) {
        console.log('No unique team subscriptions found. Exiting cron job.');
        return;
    }

    const matches: Match[] = await pandaScoreClient.getUpcomingMatches(uniqueTeamIds);

    for (const match of matches) {
        const notificationKey = `match_${match.id}`;
        const notified = await env.NOTIFICATIONS_KV.get(notificationKey);

        if (notified) {
            console.log(`Notification already sent for match ${match.id}. Skipping.`);
            continue;
        }

        const matchTime = new Date(match.begin_at).getTime();
        const currentTime = new Date().getTime();
        const timeUntilMatch = matchTime - currentTime;

        if (timeUntilMatch > 0 && timeUntilMatch <= 1800000) {
            console.log(`Sending notification for match ${match.id}`);

            const message = formatMatchNotification(match);

            const subscribersToNotify = new Set<number>();
            for (const opponent of match.opponents) {
                const teamSubscriberIds = teamIdToSubscriberIds.get(opponent.opponent.id);
                if (teamSubscriberIds) {
                    for (const subscriberId of teamSubscriberIds) {
                        const telegramId = subscriberIdToTelegramId.get(subscriberId);
                        if (telegramId) {
                            subscribersToNotify.add(telegramId);
                        }
                    }
                }
            }

            for (const telegramId of Array.from(subscribersToNotify)) {
                try {
                    await bot.telegram.sendMessage(telegramId, message, {
                        parse_mode: 'HTML',
                    });
                } catch (e) {
                    console.error(`Failed to send message to ${telegramId}:`, e);
                }
            }

            await env.NOTIFICATIONS_KV.put(notificationKey, 'true', {
                expirationTtl: 3600 * 24,
            });
        }
    }

    console.log('Cron job finished.');
}

function formatMatchNotification(match: Match): string {
    const team1 = match.opponents[0]?.opponent.name || 'TBD';
    const team2 = match.opponents[1]?.opponent.name || 'TBD';
    const league = match.league.name;
    const serie = match.serie.full_name;
    const startTime = new Date(match.begin_at).toLocaleString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });

    return `
⚽️ <b>Upcoming Dota 2 Match!</b> ⚽️

<b>${team1} vs ${team2}</b>
🗓️ ${startTime}
🏆 ${league} - ${serie}
`;
}

async function pollTelegramUpdates(env: Env): Promise<void> {
    try {
        const workerUrl = 'https://dota-match-announcer.atainogoibaev.workers.dev';
        const response = await fetch(`${workerUrl}/poll-updates`);
        const result = await response.json();
        console.log('Telegram polling result:', result);
    } catch (error) {
        console.error('Error calling poll-updates endpoint:', error);
    }
}
