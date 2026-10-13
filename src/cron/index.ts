import { Env } from '../index';
import { PandaScoreClient, Match, Game, Team } from '../pandascore';
import { getDb } from '../db/utils';
import { Subscriber } from '../db/utils';
import { Telegraf } from 'telegraf';
import { formatMatchTime, getTimezoneAbbreviation } from '../utils/timezone';
import { escapeHtml } from '../utils/html';
import { buildIcsCalendar } from '../utils/ics';
import { NotificationLog } from './notificationLog';

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
    log: NotificationLog,
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

    const championKey = `tournament_result_${tournament.id}_${winner.id}`;
    if (await log.has(championKey)) return;

    if (!wonSerie) {
        const notFinalKey = `tournament_not_final_${tournament.id}`;
        if (await log.has(notFinalKey)) return;

        const isFinalStage = await isFinalStageOfSerie(pandaScoreClient, match);
        if (isFinalStage === null) return;
        if (!isFinalStage) {
            await log.claim(notFinalKey, 86400);
            return;
        }
    }

    if (!(await log.claim(championKey, 2592000))) return;

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
    log: NotificationLog,
    bot: Telegraf,
    match: Match,
    maps: SubscriberMaps,
): Promise<void> {
    if (!(await log.claim(`match_final_${match.id}`, 86400))) return;

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
    log: NotificationLog,
    bot: Telegraf,
    pandaScoreClient: PandaScoreClient,
    maps: SubscriberMaps,
): Promise<void> {
    const finishedMatches = await pandaScoreClient.getRecentlyFinishedMatches(maps.uniqueTeamIds);
    console.log(`[finished] Found ${finishedMatches.length} recently finished matches`);

    for (let match of finishedMatches) {
        // A canceled match never gets a result, so there is nothing to wait for or announce.
        if (match.status === 'canceled') continue;

        const alreadyNotified = await log.has(`match_final_${match.id}`);

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

            await announceFinalResult(log, bot, match, maps);
        }

        /*
         * Checked on every run while the match is still in the recently-finished
         * window, not just the one that sent the final result: PandaScore can
         * take a while to set the tournament/serie winner after the last match.
         */
        await announceChampion(log, bot, pandaScoreClient, match, maps);
    }
}

async function processLiveMatches(
    log: NotificationLog,
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
            if (!(await log.claim(`game_${match.id}_${game.id}`, 86400))) continue;

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

// Start-time changes smaller than this are schedule jitter, not worth a message.
const RESCHEDULE_THRESHOLD_MS = 30 * 60 * 1000;

function isOpponentKnown(match: Match): boolean {
    return match.opponents.length === 2 && !!match.opponents[0]?.opponent && !!match.opponents[1]?.opponent;
}

async function announceNewMatch(
    log: NotificationLog,
    bot: Telegraf,
    match: Match,
    maps: SubscriberMaps,
): Promise<void> {
    const opponentKnown = isOpponentKnown(match);
    const knownKey = `match_announced_known_${match.id}`;
    const tbdKey = `match_announced_tbd_${match.id}`;

    if (!opponentKnown) {
        if (!(await log.claim(tbdKey, 2592000))) return;

        await sendToMatchRecipients(bot, match, maps, () => formatAdvancingMessage(match));

        console.log(`[upcoming] Announced advancement for match ${match.id} (opponent not yet known)`);
        return;
    }

    if (await log.has(knownKey)) {
        await announceReschedule(log, bot, match, maps, knownKey);
        return;
    }

    /*
     * If we already told subscribers their team advanced while the opponent was
     * still TBD, this is the follow-up reveal, not a brand new match - the two
     * deserve different framing rather than one dedup key swallowing the second.
     */
    const wasPreviouslyTbd = await log.has(tbdKey);
    const title = wasPreviouslyTbd ? '🎭 <b>Opponent Revealed!</b>' : '📢 <b>New Match Scheduled!</b>';
    // The announced start time is kept with the claim, so a later change to it can be noticed.
    if (!(await log.claim(knownKey, 2592000, match.begin_at))) return;

    await sendToMatchRecipients(bot, match, maps, (userTimezone) =>
        formatMatchAnnouncement(match, userTimezone, title),
    );

    console.log(`[upcoming] Announced match ${match.id} (revealed: ${wasPreviouslyTbd})`);
}

/*
 * Tells subscribers when an already-announced match moves, and sends a fresh
 * calendar file - otherwise the time in the original announcement and the
 * calendar entry made from it quietly go stale.
 */
async function announceReschedule(
    log: NotificationLog,
    bot: Telegraf,
    match: Match,
    maps: SubscriberMaps,
    knownKey: string,
): Promise<void> {
    const newStart = new Date(match.begin_at).getTime();
    if (isNaN(newStart)) return;

    const announcedBeginAt = log.value(knownKey);
    const announcedStart = announcedBeginAt ? new Date(announcedBeginAt).getTime() : NaN;
    if (!announcedBeginAt || isNaN(announcedStart)) {
        // Announced before start times were recorded: take the current one as the baseline, silently.
        await log.updateValue(knownKey, match.begin_at);
        return;
    }

    /*
     * Measured against the time subscribers were last told, not the previous
     * run, so a start that creeps a few minutes at a time still gets reported
     * once it has drifted far enough.
     */
    if (Math.abs(newStart - announcedStart) < RESCHEDULE_THRESHOLD_MS) return;

    if (!(await log.updateValue(knownKey, match.begin_at))) return;

    // The "starting soon" reminder may already have gone out for the old time.
    await log.release(`match_${match.id}`);

    await sendToMatchRecipients(
        bot,
        match,
        maps,
        (userTimezone) => formatRescheduleMessage(match, announcedBeginAt, userTimezone),
        Math.floor(Date.now() / 1000),
    );

    console.log(`[upcoming] Announced reschedule of match ${match.id} (${announcedBeginAt} -> ${match.begin_at})`);
}

function buildMatchCalendarFile(
    match: Match,
    sequence?: number,
): { source: Buffer; filename: string } | null {
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
        sequence,
    });

    return { source: Buffer.from(ics, 'utf-8'), filename: `match-${match.id}.ics` };
}

async function sendToMatchRecipients(
    bot: Telegraf,
    match: Match,
    maps: SubscriberMaps,
    buildMessage: (userTimezone: string) => string,
    calendarSequence?: number,
): Promise<void> {
    const telegramIds = getTelegramIdsForMatch(match, maps);
    const calendarFile = buildMatchCalendarFile(match, calendarSequence);

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
    log: NotificationLog,
    bot: Telegraf,
    match: Match,
    maps: SubscriberMaps,
): Promise<void> {
    const notificationKey = `match_${match.id}`;

    const matchTime = new Date(match.begin_at).getTime();
    const timeUntilMatch = matchTime - Date.now();

    if (timeUntilMatch > 0 && timeUntilMatch <= 600000) {
        if (!(await log.claim(notificationKey, 86400))) return;

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
    log: NotificationLog,
    bot: Telegraf,
    pandaScoreClient: PandaScoreClient,
    maps: SubscriberMaps,
): Promise<void> {
    const matches: Match[] = await pandaScoreClient.getUpcomingMatches(maps.uniqueTeamIds);
    console.log(`[upcoming] Found ${matches.length} upcoming matches`);

    for (const match of matches) {
        await announceNewMatch(log, bot, match, maps);
        await announceMatchStartingSoon(log, bot, match, maps);
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

function formatRescheduleMessage(match: Match, previousBeginAt: string, userTimezone: string): string {
    const team1 = escapeHtml(match.opponents[0]?.opponent?.name || 'TBD');
    const team2 = escapeHtml(match.opponents[1]?.opponent?.name || 'TBD');
    const league = escapeHtml(match.league.name);
    const serie = escapeHtml(match.serie.full_name);

    const newTime = formatMatchTime(match.begin_at, userTimezone);
    const newTzAbbr = getTimezoneAbbreviation(new Date(match.begin_at), userTimezone);
    const previousTime = formatMatchTime(previousBeginAt, userTimezone);
    const previousTzAbbr = getTimezoneAbbreviation(new Date(previousBeginAt), userTimezone);
    const boInfo = match.number_of_games
        ? `\n🎮 Best of ${match.number_of_games} (BO${match.number_of_games})`
        : '';

    return `\
⏰ <b>Match Rescheduled</b>

<b>${team1} vs ${team2}</b>
🗓️ ${newTime} ${newTzAbbr}
↩️ Was: ${previousTime} ${previousTzAbbr}${boInfo}
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
    const log = await NotificationLog.load(env);

    /*
     * Everything runs on the single 1-minute trigger so a newly scheduled match
     * - e.g. the next round after a team advances - gets announced within a
     * minute of PandaScore publishing it. Keep it to one cron schedule: a
     * second one firing in the same minute would only repeat the same work.
     */
    const steps: Array<[string, () => Promise<void>]> = [
        ['upcoming', () => processUpcomingMatches(log, bot, pandaScoreClient, maps)],
        ['live', () => processLiveMatches(log, bot, pandaScoreClient, maps)],
        ['finished', () => processFinishedMatches(log, bot, pandaScoreClient, maps)],
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
