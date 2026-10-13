import { Env } from '../index';
import { PandaScoreClient, Match, Game, Team } from '../pandascore';
import { getDb } from '../db/utils';
import { Subscriber } from '../db/utils';
import { Telegraf } from 'telegraf';
import { formatMatchTime, getTimezoneAbbreviation } from '../utils/timezone';
import { escapeHtml } from '../utils/html';
import { buildIcsCalendar } from '../utils/ics';

interface SubscriberMaps {
    teamIdToSubscriberIds: Map<number, Set<number>>;
    subscriberIdToTelegramId: Map<number, number>;
    telegramIdToTeamIds: Map<number, Set<number>>;
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
    const telegramIdToTeamIds = new Map<number, Set<number>>();
    for (const sub of allSubscriptions) {
        if (!teamIdToSubscriberIds.has(sub.teamId)) {
            teamIdToSubscriberIds.set(sub.teamId, new Set<number>());
        }
        teamIdToSubscriberIds.get(sub.teamId)?.add(sub.subscriberId);

        const telegramId = subscriberIdToTelegramId.get(sub.subscriberId);
        if (!telegramId) continue;
        if (!telegramIdToTeamIds.has(telegramId)) {
            telegramIdToTeamIds.set(telegramId, new Set<number>());
        }
        telegramIdToTeamIds.get(telegramId)?.add(sub.teamId);
    }

    return {
        teamIdToSubscriberIds,
        subscriberIdToTelegramId,
        telegramIdToTeamIds,
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

/*
 * The team a recipient is rooting for in this match, so results can be worded
 * from their side ("lost Map 1" instead of the opponent "wins Map 1"). Null
 * when they follow both teams (or neither), where neutral wording is the only
 * one that makes sense.
 */
function getFollowedTeam(match: Match, telegramId: number, maps: SubscriberMaps): Team | null {
    const followedTeamIds = maps.telegramIdToTeamIds.get(telegramId);
    if (!followedTeamIds) return null;
    const followed = match.opponents
        .map(o => o.opponent)
        .filter((team): team is Team => !!team && followedTeamIds.has(team.id));
    return followed.length === 1 ? followed[0] : null;
}

function formatMapResultMessage(match: Match, game: Game, followedTeam: Team | null): string {
    const team1 = escapeHtml(match.opponents[0]?.opponent?.name || 'TBD');
    const team2 = escapeHtml(match.opponents[1]?.opponent?.name || 'TBD');
    const winnerName = escapeHtml(match.opponents.find(o => o.opponent?.id === game.winner?.id)?.opponent?.name || 'Unknown');
    const seriesScore = formatSeriesScore(match);
    const league = escapeHtml(match.league.name);
    const serie = escapeHtml(match.serie.full_name);

    let resultLine = `✅ <b>${winnerName}</b> wins Map ${game.position}!`;
    if (followedTeam && followedTeam.id !== game.winner?.id) {
        resultLine = `❌ <b>${escapeHtml(followedTeam.name)}</b> lost Map ${game.position}.`;
    }

    return `\
🎮 <b>Map ${game.position} Result</b>

<b>${team1}</b> vs <b>${team2}</b>
${resultLine}
📊 Series: ${seriesScore}

🏆 ${league} - ${serie}`;
}

function formatFinalResultMessage(match: Match, followedTeam: Team | null): string {
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

    let resultLine = `🏆 <b>${winnerName}</b> wins the series ${score1}–${score2}!`;
    if (match.draw) {
        resultLine = `🤝 Series drawn ${score1}–${score2}.`;
    } else if (followedTeam && followedTeam.id !== match.winner?.id) {
        // Lead with the followed team's own score, e.g. "lost the series 1–2".
        const [ownScore, otherScore] = followedTeam.id === team1?.id ? [score1, score2] : [score2, score1];
        resultLine = `💔 <b>${escapeHtml(followedTeam.name)}</b> lost the series ${ownScore}–${otherScore}.`;
    }

    return `\
🏁 <b>Match Over</b>

<b>${team1Name}</b> vs <b>${team2Name}</b>
${resultLine}

🏆 ${league} - ${serie}`;
}

function formatChampionMessage(match: Match, teamName: string): string {
    const league = escapeHtml(match.league.name);
    const serie = escapeHtml(match.serie.full_name);

    return `\
🏆 <b>Champions!</b>

<b>${escapeHtml(teamName)}</b> won the tournament!

🎉 ${league} - ${serie}`;
}

/*
 * PandaScore models every stage of an event (group stage, playoffs, ...) as its
 * own "tournament" under one serie, so a tournament winner is only the event
 * champion if that tournament is the serie's last stage. Returns null when that
 * can't be determined yet, so the caller can retry on a later run.
 */
async function isFinalStageOfSerie(
    pandaScoreClient: PandaScoreClient,
    match: Match,
): Promise<boolean | null> {
    const tournament = match.tournament;
    if (!tournament || !match.serie_id) return null;

    try {
        const serie = await pandaScoreClient.getSerieById(match.serie_id);
        const stages = serie.tournaments || [];
        const current = stages.find(t => t.id === tournament.id);
        if (!current?.begin_at) return null;

        const currentStart = new Date(current.begin_at).getTime();
        // Stages starting alongside this one (parallel groups) can't be told apart, so none counts as the final.
        return stages.every(
            t => t.id === current.id || (!!t.begin_at && new Date(t.begin_at).getTime() < currentStart),
        );
    } catch (e) {
        console.error(`[tournament] Failed to fetch serie ${match.serie_id}:`, e);
        return null;
    }
}

/*
 * Only the event win is announced. Placements are deliberately not: mid-event
 * standings are not final (an upper-bracket loss is not an elimination, and a
 * finished stage is not a finished event), which used to produce bogus
 * "finished in place #N" messages.
 */
async function announceChampion(
    env: Env,
    bot: Telegraf,
    pandaScoreClient: PandaScoreClient,
    match: Match,
    maps: SubscriberMaps,
): Promise<void> {
    const winner = match.winner;
    const tournament = match.tournament;
    if (!winner?.id || !tournament) return;

    const subscriberIds = maps.teamIdToSubscriberIds.get(winner.id);
    if (!subscriberIds) return;

    const wonSerie = match.serie.winner_id === winner.id;
    if (!wonSerie && tournament.winner_id !== winner.id) return;

    const kvKey = `tournament_result_${tournament.id}_${winner.id}`;
    if (await env.NOTIFICATIONS_KV.get(kvKey)) return;

    if (!wonSerie) {
        const notFinalKey = `tournament_not_final_${tournament.id}`;
        if (await env.NOTIFICATIONS_KV.get(notFinalKey)) return;

        const isFinalStage = await isFinalStageOfSerie(pandaScoreClient, match);
        if (isFinalStage === null) return;
        if (!isFinalStage) {
            await env.NOTIFICATIONS_KV.put(notFinalKey, 'true', { expirationTtl: 86400 });
            return;
        }
    }

    await env.NOTIFICATIONS_KV.put(kvKey, 'true', { expirationTtl: 2592000 });

    const message = formatChampionMessage(match, winner.name);
    for (const subId of subscriberIds) {
        const telegramId = maps.subscriberIdToTelegramId.get(subId);
        if (!telegramId) continue;
        try {
            await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'HTML' });
        } catch (e) {
            console.error(`[tournament] Failed to send champion message to ${telegramId}:`, e);
        }
    }

    console.log(`[tournament] Announced team ${winner.id} as champion of tournament ${tournament.id}`);
}

async function announceFinalResult(
    env: Env,
    bot: Telegraf,
    match: Match,
    maps: SubscriberMaps,
): Promise<void> {
    await env.NOTIFICATIONS_KV.put(`match_final_${match.id}`, 'true', { expirationTtl: 86400 });

    for (const telegramId of getTelegramIdsForMatch(match, maps)) {
        try {
            const message = formatFinalResultMessage(match, getFollowedTeam(match, telegramId, maps));
            await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'HTML' });
        } catch (e) {
            console.error(`[finished] Failed to send final result to ${telegramId}:`, e);
        }
    }

    console.log(`[finished] Notified final result for match ${match.id}`);
}

async function processFinishedMatches(
    env: Env,
    bot: Telegraf,
    pandaScoreClient: PandaScoreClient,
    maps: SubscriberMaps,
): Promise<void> {
    const finishedMatches = await pandaScoreClient.getRecentlyFinishedMatches(maps.uniqueTeamIds);
    console.log(`[finished] Found ${finishedMatches.length} recently finished matches`);

    for (let match of finishedMatches) {
        // A canceled match never gets a result, so there is nothing to wait for or announce.
        if (match.status === 'canceled') continue;

        const alreadyNotified = await env.NOTIFICATIONS_KV.get(`match_final_${match.id}`);

        if (!alreadyNotified) {
            // A drawn series (e.g. a 1-1 best-of-2) is final without ever having a winner.
            if (!match.winner?.id && !match.draw) {
                console.log(`[finished] Winner not yet available for match ${match.id}, re-fetching...`);
                try {
                    match = await pandaScoreClient.getMatchById(match.id);
                } catch (e) {
                    console.error(`[finished] Re-fetch failed for match ${match.id}:`, e);
                }
                if (!match.winner?.id && !match.draw) {
                    console.log(`[finished] Still no winner for match ${match.id}, skipping until next run`);
                    continue;
                }
            }

            await announceFinalResult(env, bot, match, maps);
        }

        /*
         * Checked on every run while the match is still in the recently-finished
         * window, not just the one that sent the final result: PandaScore can
         * take a while to set the tournament/serie winner after the last match.
         */
        await announceChampion(env, bot, pandaScoreClient, match, maps);
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

            await env.NOTIFICATIONS_KV.put(kvKey, 'true', { expirationTtl: 86400 });

            const telegramIds = getTelegramIdsForMatch(match, maps);

            for (const telegramId of telegramIds) {
                try {
                    const message = formatMapResultMessage(match, game, getFollowedTeam(match, telegramId, maps));
                    await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'HTML' });
                } catch (e) {
                    console.error(`[live] Failed to send map result to ${telegramId}:`, e);
                }
            }

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

        await env.NOTIFICATIONS_KV.put(tbdKey, 'true', { expirationTtl: 2592000 });

        await sendToMatchRecipients(env, bot, match, maps, () => formatAdvancingMessage(match));

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
    await env.NOTIFICATIONS_KV.put(knownKey, 'true', { expirationTtl: 2592000 });

    await sendToMatchRecipients(env, bot, match, maps, (userTimezone) =>
        formatMatchAnnouncement(match, userTimezone, title),
    );

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
        await env.NOTIFICATIONS_KV.put(notificationKey, 'true', { expirationTtl: 86400 });

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

/*
 * Every notification is deduped by a KV key that is written *before* the
 * messages go out: a run that dies half-way then costs at most one missed
 * notification instead of re-sending to everyone a minute later.
 *
 * KV is only eventually consistent, and in particular caches "key not found"
 * for a while, so a key written earlier in a run can still read back as
 * missing later in that same run. This wrapper makes a run always see its own
 * writes, so nothing is announced twice within one run (e.g. if PandaScore
 * lists the same match twice).
 */
function rememberOwnWrites(kv: KVNamespace): KVNamespace {
    const written = new Map<string, string>();
    return {
        get: async (key: string) => written.get(key) ?? kv.get(key),
        put: async (key: string, value: string, options?: KVNamespacePutOptions) => {
            written.set(key, value);
            await kv.put(key, value, options);
        },
    } as unknown as KVNamespace;
}

export async function handleCron(baseEnv: Env, cron?: string) {
    console.log(`Cron job started (trigger: ${cron})...`);

    const env: Env = { ...baseEnv, NOTIFICATIONS_KV: rememberOwnWrites(baseEnv.NOTIFICATIONS_KV) };

    const maps = await buildSubscriberMaps(env);
    if (!maps) return;

    const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);
    const pandaScoreClient = new PandaScoreClient(baseEnv);

    /*
     * Everything runs on the single 1-minute trigger so a newly scheduled match
     * - e.g. the next round after a team advances - gets announced within a
     * minute of PandaScore publishing it. There must be only one cron schedule:
     * two schedules firing in the same minute run concurrently, both pass the
     * KV dedup check before either writes, and every notification goes out twice.
     */
    const steps: Array<[string, () => Promise<void>]> = [
        ['upcoming', () => processUpcomingMatches(env, bot, pandaScoreClient, maps)],
        ['live', () => processLiveMatches(env, bot, pandaScoreClient, maps)],
        ['finished', () => processFinishedMatches(env, bot, pandaScoreClient, maps)],
    ];
    for (const [name, run] of steps) {
        // One failing step (e.g. a PandaScore error on a single endpoint) must not cost the others their run.
        try {
            await run();
        } catch (e) {
            console.error(`[${name}] Step failed:`, e);
        }
    }

    console.log('Cron job finished.');
}
