import { readFileSync } from 'fs';
import { join } from 'path';
import { handleCron } from '../src/cron';
import { Env } from '../src';
import { PandaScoreClient, Match, Game, GameWinner, Serie, Team, Tournament } from '../src/pandascore';
import { getDb } from '../src/db/utils';
import { Telegraf } from 'telegraf';

jest.mock('../src/pandascore');
jest.mock('../src/db/utils');
jest.mock('telegraf');

const CRON = '*/1 * * * *';
const MINUTE = 60 * 1000;

const liquid: Team = { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null };
const secret: Team = { id: 20, name: 'Team Secret', acronym: 'Secret', image_url: null };
const spirit: Team = { id: 30, name: 'Team Spirit', acronym: 'TS', image_url: null };
const yandex: Team = { id: 40, name: 'Team Yandex', acronym: 'YA', image_url: null };

const game = (id: number, position: number, winnerId: number): Game => ({
    id,
    position,
    status: 'finished',
    winner: { id: winnerId, type: 'Team' } as GameWinner,
    winner_type: 'Team',
    length: 2400,
    begin_at: null,
    end_at: null,
});

const buildMatch = (overrides: Partial<Match> = {}): Match => ({
    id: 300,
    name: 'Match 300',
    status: 'finished',
    begin_at: new Date(Date.now() - 90 * MINUTE).toISOString(),
    end_at: new Date(Date.now() - 10 * MINUTE).toISOString(),
    winner: liquid,
    games: [game(3001, 1, 10), game(3002, 2, 20), game(3003, 3, 10)],
    opponents: [
        { opponent: liquid, type: 'Team' },
        { opponent: secret, type: 'Team' },
    ],
    results: [],
    league: { name: 'ESL One', image_url: null },
    serie_id: 7,
    serie: { full_name: 'Spring 2024', winner_id: null },
    streams_list: [],
    ...overrides,
});

const stage = (id: number, name: string, winnerId: number | null, endAt: string | null = null): Tournament => ({
    id,
    name,
    has_bracket: true,
    winner_id: winnerId,
    winner_type: winnerId ? 'Team' : null,
    end_at: endAt,
});

const serieWithStages = (...stages: Array<[number, string | null]>): Serie => ({
    id: 7,
    winner_id: null,
    tournaments: stages.map(([id, begin_at]) => ({ id, begin_at, end_at: null })),
});

describe('cron notifications', () => {
    let kvStore: Map<string, string>;
    let sent: Map<string, string | null>;
    let mockKv: { get: jest.Mock; put: jest.Mock };
    let mockEnv: Env;
    let mockPandaScoreClient: jest.Mocked<PandaScoreClient>;
    let mockDb: Record<string, jest.Mock>;
    let sendMessage: jest.Mock;
    let sendDocument: jest.Mock;

    // Each pair is [telegramId, followed teamId]; one telegramId may appear several times.
    const subscribe = (...pairs: Array<[number, number]>) => {
        const telegramIds = Array.from(new Set(pairs.map(([telegramId]) => telegramId)));
        mockDb.getAllSubscribers.mockResolvedValue(
            telegramIds.map((telegramId, i) => ({
                id: i + 1, telegramId, timezone: 'UTC', createdAt: new Date().toISOString(),
            })),
        );
        mockDb.getAllSubscriptions.mockResolvedValue(
            pairs.map(([telegramId, teamId], i) => ({
                id: i + 1,
                subscriberId: telegramIds.indexOf(telegramId) + 1,
                teamId,
                teamName: `Team ${teamId}`,
                createdAt: new Date().toISOString(),
            })),
        );
    };

    const messagesTo = (telegramId: number): string[] =>
        sendMessage.mock.calls.filter(call => call[0] === telegramId).map(call => call[1] as string);
    const allMessages = (): string[] => sendMessage.mock.calls.map(call => call[1] as string);

    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
        jest.spyOn(console, 'error').mockImplementation(() => undefined);

        // KV only holds notifications recorded before the move to D1; nothing writes to it any more.
        kvStore = new Map<string, string>();
        mockKv = {
            get: jest.fn(async (key: string) => kvStore.get(key) ?? null),
            put: jest.fn(async (key: string, value: string) => {
                kvStore.set(key, value);
            }),
        };

        mockPandaScoreClient = new (PandaScoreClient as jest.Mock<PandaScoreClient>)() as jest.Mocked<PandaScoreClient>;
        (PandaScoreClient as jest.Mock).mockImplementation(() => mockPandaScoreClient);
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue([]);
        mockPandaScoreClient.getRunningMatches.mockResolvedValue([]);
        mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([]);
        mockPandaScoreClient.getSerieById.mockResolvedValue(serieWithStages([99, '2024-03-10T00:00:00Z']));

        /*
         * Stands in for the SentNotifications table. Like the real INSERT ... ON
         * CONFLICT, a claim checks and records in one step with no await in
         * between, so only one of several simultaneous callers can win.
         */
        sent = new Map<string, string | null>();
        mockDb = {
            getAllSubscriptions: jest.fn(),
            getAllSubscribers: jest.fn(),
            deleteExpiredNotifications: jest.fn(async () => undefined),
            getActiveNotifications: jest.fn(async () =>
                Array.from(sent.entries()).map(([key, value]) => ({ key, value })),
            ),
            claimNotification: jest.fn(async (key: string, _ttlSeconds: number, value: string | null = null) => {
                await Promise.resolve();
                if (sent.has(key)) return false;
                sent.set(key, value);
                return true;
            }),
            updateNotificationValue: jest.fn(async (key: string, expectedValue: string | null, value: string) => {
                await Promise.resolve();
                if (!sent.has(key) || sent.get(key) !== expectedValue) return false;
                sent.set(key, value);
                return true;
            }),
            releaseNotification: jest.fn(async (key: string) => {
                sent.delete(key);
            }),
        };
        (getDb as jest.Mock).mockReturnValue(mockDb);

        sendMessage = jest.fn();
        sendDocument = jest.fn();
        const mockBot = new (Telegraf as unknown as jest.Mock<Telegraf>)() as jest.Mocked<Telegraf>;
        mockBot.telegram = { sendMessage, sendDocument } as any;
        (Telegraf as unknown as jest.Mock).mockImplementation(() => mockBot);

        mockEnv = { NOTIFICATIONS_KV: mockKv as unknown as KVNamespace } as Env;
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    describe('no double notifications', () => {
        it('should have exactly one cron schedule, since overlapping schedules run concurrently and both send', () => {
            const wrangler = readFileSync(join(__dirname, '..', 'wrangler.toml'), 'utf-8');
            const crons = /^crons\s*=\s*\[(.*)\]/m.exec(wrangler)?.[1] ?? '';

            expect(crons.match(/"[^"]+"/g)).toEqual(['"*/1 * * * *"']);
        });

        it('should send each upcoming notification once to a subscriber who follows both teams', async () => {
            subscribe([111, 10], [111, 20]);
            mockPandaScoreClient.getUpcomingMatches.mockResolvedValue([
                buildMatch({
                    status: 'not_started',
                    winner: null,
                    games: [],
                    begin_at: new Date(Date.now() + 5 * MINUTE).toISOString(),
                    end_at: null,
                }),
            ]);

            await handleCron(mockEnv, CRON);

            expect(messagesTo(111)).toEqual([
                expect.stringContaining('New Match Scheduled!'),
                expect.stringContaining('Upcoming Dota 2 Match!'),
            ]);
            expect(sendDocument).toHaveBeenCalledTimes(1);
        });

        it('should send each map result once to a subscriber who follows both teams', async () => {
            subscribe([111, 10], [111, 20]);
            mockPandaScoreClient.getRunningMatches.mockResolvedValue([
                buildMatch({ status: 'running', winner: null, games: [game(3001, 1, 10), game(3002, 2, 20)] }),
            ]);

            await handleCron(mockEnv, CRON);

            expect(messagesTo(111)).toEqual([
                expect.stringContaining('Map 1 Result'),
                expect.stringContaining('Map 2 Result'),
            ]);
        });

        it('should send the final result once to a subscriber who follows both teams', async () => {
            subscribe([111, 10], [111, 20]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([buildMatch()]);

            await handleCron(mockEnv, CRON);

            expect(messagesTo(111)).toEqual([expect.stringContaining('Match Over')]);
        });

        it('should send one message per match when followed teams play in separate matches', async () => {
            subscribe([111, 10], [111, 30]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch(),
                buildMatch({
                    id: 301,
                    winner: yandex,
                    games: [game(3011, 1, 40), game(3012, 2, 40)],
                    opponents: [{ opponent: yandex, type: 'Team' }, { opponent: spirit, type: 'Team' }],
                }),
            ]);

            await handleCron(mockEnv, CRON);

            expect(messagesTo(111)).toEqual([
                expect.stringContaining('Team Liquid</b> wins the series 2–1!'),
                expect.stringContaining('Team Spirit</b> lost the series 0–2.'),
            ]);
        });

        it('should not repeat anything on later runs while PandaScore keeps returning the same data', async () => {
            subscribe([111, 10], [222, 20]);
            mockPandaScoreClient.getUpcomingMatches.mockResolvedValue([
                buildMatch({
                    id: 500,
                    status: 'not_started',
                    winner: null,
                    games: [],
                    begin_at: new Date(Date.now() + 5 * MINUTE).toISOString(),
                    end_at: null,
                }),
            ]);
            mockPandaScoreClient.getRunningMatches.mockResolvedValue([
                buildMatch({ id: 501, status: 'running', winner: null, games: [game(5011, 1, 10)] }),
            ]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ id: 502, tournament_id: 99, tournament: stage(99, 'Playoffs', 10) }),
            ]);

            await handleCron(mockEnv, CRON);
            const messagesAfterFirstRun = sendMessage.mock.calls.length;
            const documentsAfterFirstRun = sendDocument.mock.calls.length;
            await handleCron(mockEnv, CRON);
            await handleCron(mockEnv, CRON);

            // New match + starting soon + map result + final result for each, plus one champion message
            expect(messagesAfterFirstRun).toBe(9);
            expect(sendMessage).toHaveBeenCalledTimes(messagesAfterFirstRun);
            expect(sendDocument).toHaveBeenCalledTimes(documentsAfterFirstRun);
        });

        it('should announce once when PandaScore lists the same match twice', async () => {
            subscribe([111, 10]);
            const finished = buildMatch({ tournament_id: 99, tournament: stage(99, 'Playoffs', 10) });
            const running = buildMatch({ id: 501, status: 'running', winner: null, games: [game(5011, 1, 10)] });
            mockPandaScoreClient.getRunningMatches.mockResolvedValue([running, running]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([finished, finished]);

            await handleCron(mockEnv, CRON);

            expect(messagesTo(111)).toEqual([
                expect.stringContaining('Map 1 Result'),
                expect.stringContaining('Match Over'),
                expect.stringContaining('Champions!'),
            ]);
        });

        it('should announce the champion once when two followed teams both finished matches in the same tournament', async () => {
            subscribe([111, 10], [111, 30]);
            const playoffs = stage(99, 'Playoffs', 10);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ tournament_id: 99, tournament: playoffs }),
                buildMatch({
                    id: 301,
                    winner: liquid,
                    games: [game(3011, 1, 10), game(3012, 2, 10)],
                    opponents: [{ opponent: liquid, type: 'Team' }, { opponent: spirit, type: 'Team' }],
                    tournament_id: 99,
                    tournament: playoffs,
                }),
            ]);

            await handleCron(mockEnv, CRON);

            expect(allMessages().filter(m => m.includes('Champions!'))).toHaveLength(1);
            expect(allMessages().filter(m => m.includes('Match Over'))).toHaveLength(2);
        });

        it('should record a notification as sent before sending it, so an interrupted run cannot re-send it', async () => {
            subscribe([111, 10], [222, 20]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([buildMatch()]);
            const recordedAtSendTime: boolean[] = [];
            sendMessage.mockImplementation(async () => {
                recordedAtSendTime.push(sent.has('match_final_300'));
            });

            await handleCron(mockEnv, CRON);

            expect(recordedAtSendTime).toEqual([true, true]);
        });

        it('should send everything once when cron runs overlap', async () => {
            subscribe([111, 10], [222, 20]);
            mockPandaScoreClient.getUpcomingMatches.mockResolvedValue([
                buildMatch({
                    id: 500,
                    status: 'not_started',
                    winner: null,
                    games: [],
                    begin_at: new Date(Date.now() + 5 * MINUTE).toISOString(),
                    end_at: null,
                }),
            ]);
            mockPandaScoreClient.getRunningMatches.mockResolvedValue([
                buildMatch({ id: 501, status: 'running', winner: null, games: [game(5011, 1, 10)] }),
            ]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ id: 502, tournament_id: 99, tournament: stage(99, 'Playoffs', 10) }),
            ]);

            await Promise.all([handleCron(mockEnv, CRON), handleCron(mockEnv, CRON), handleCron(mockEnv, CRON)]);

            // Every overlapping run loaded an empty log, so only the atomic claim keeps them apart.
            expect(mockDb.getActiveNotifications).toHaveBeenCalledTimes(3);
            expect(messagesTo(111).map(m => m.split('\n')[0]).sort()).toEqual([
                '<b>Upcoming Dota 2 Match!</b>',
                '🎮 <b>Map 1 Result</b>',
                '🏁 <b>Match Over</b>',
                '🏆 <b>Champions!</b>',
                '📢 <b>New Match Scheduled!</b>',
            ].sort());
            expect(messagesTo(222)).toHaveLength(4);
            expect(sendDocument).toHaveBeenCalledTimes(2);
        });

        it('should not re-announce what was already sent before notifications moved from KV to D1', async () => {
            subscribe([111, 10]);
            kvStore.set('match_announced_known_500', 'true');
            kvStore.set('game_501_5011', 'true');
            kvStore.set('match_final_502', 'true');
            kvStore.set('tournament_result_99_10', 'true');
            mockPandaScoreClient.getUpcomingMatches.mockResolvedValue([
                buildMatch({
                    id: 500,
                    status: 'not_started',
                    winner: null,
                    games: [],
                    begin_at: new Date(Date.now() + 3 * 60 * MINUTE).toISOString(),
                    end_at: null,
                }),
            ]);
            mockPandaScoreClient.getRunningMatches.mockResolvedValue([
                buildMatch({ id: 501, status: 'running', winner: null, games: [game(5011, 1, 10)] }),
            ]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ id: 502, tournament_id: 99, tournament: stage(99, 'Playoffs', 10) }),
            ]);

            await handleCron(mockEnv, CRON);
            const kvReadsOnFirstRun = mockKv.get.mock.calls.length;
            await handleCron(mockEnv, CRON);

            expect(sendMessage).not.toHaveBeenCalled();
            expect(sendDocument).not.toHaveBeenCalled();
            // Each old entry is copied to D1 on first sight, so KV is not consulted for it again.
            expect(Array.from(sent.keys())).toEqual(expect.arrayContaining([
                'match_announced_known_500', 'game_501_5011', 'match_final_502', 'tournament_result_99_10',
            ]));
            expect(mockKv.get.mock.calls.length).toBe(kvReadsOnFirstRun);
            expect(mockKv.put).not.toHaveBeenCalled();
        });

        it('should not send when another run has already claimed the notification', async () => {
            subscribe([111, 10]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([buildMatch()]);
            // The log was loaded before the other run recorded its claim, so only the claim itself can tell.
            mockDb.claimNotification.mockResolvedValue(false);

            await handleCron(mockEnv, CRON);

            expect(mockDb.claimNotification).toHaveBeenCalledWith('match_final_300', 86400);
            expect(sendMessage).not.toHaveBeenCalled();
        });

        it('should not re-send to anyone on the next run when one recipient failed', async () => {
            subscribe([111, 10], [222, 20]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([buildMatch()]);
            sendMessage.mockRejectedValueOnce(new Error('403: bot was blocked by the user'));

            await handleCron(mockEnv, CRON);
            await handleCron(mockEnv, CRON);

            expect(sendMessage).toHaveBeenCalledTimes(2);
        });
    });

    describe('no wrong placements', () => {
        const expectNoTournamentMessage = () => {
            for (const message of allMessages()) {
                expect(message).not.toContain('finished in place');
                expect(message).not.toContain('Tournament Result');
                expect(message).not.toContain('Champions!');
                expect(message).not.toContain('won the tournament');
            }
        };

        it('should not report a placement when the followed team loses a bracket match mid-playoffs', async () => {
            subscribe([111, 30]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({
                    winner: yandex,
                    games: [game(3001, 1, 40), game(3002, 2, 40)],
                    opponents: [{ opponent: yandex, type: 'Team' }, { opponent: spirit, type: 'Team' }],
                    tournament_id: 99,
                    tournament: stage(99, 'Playoffs', null),
                }),
            ]);

            await handleCron(mockEnv, CRON);

            expect(messagesTo(111)).toEqual([expect.stringContaining('Team Spirit</b> lost the series 0–2.')]);
            expectNoTournamentMessage();
        });

        it('should not report a placement when the followed team wins a match and the playoffs are still running', async () => {
            subscribe([111, 30]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({
                    winner: spirit,
                    games: [game(3001, 1, 30), game(3002, 2, 30)],
                    opponents: [{ opponent: yandex, type: 'Team' }, { opponent: spirit, type: 'Team' }],
                    tournament_id: 99,
                    tournament: stage(99, 'Playoffs', null),
                }),
            ]);

            await handleCron(mockEnv, CRON);

            expect(messagesTo(111)).toHaveLength(1);
            expectNoTournamentMessage();
            expect(mockPandaScoreClient.getSerieById).not.toHaveBeenCalled();
        });

        it('should not report a placement for a stage whose end date has passed', async () => {
            subscribe([111, 20]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({
                    tournament_id: 98,
                    tournament: stage(98, 'Group Stage', null, new Date(Date.now() - MINUTE).toISOString()),
                }),
            ]);

            await handleCron(mockEnv, CRON);

            expect(messagesTo(111)).toHaveLength(1);
            expectNoTournamentMessage();
        });

        it('should not call a team champion for topping a stage that is followed by a later one', async () => {
            subscribe([111, 10]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ tournament_id: 98, tournament: stage(98, 'Group Stage', 10) }),
            ]);
            mockPandaScoreClient.getSerieById.mockResolvedValue(
                serieWithStages([98, '2024-03-01T00:00:00Z'], [99, '2024-03-10T00:00:00Z']),
            );

            await handleCron(mockEnv, CRON);
            await handleCron(mockEnv, CRON);

            expectNoTournamentMessage();
            // The "not the final stage" verdict is remembered rather than re-fetched every minute.
            expect(mockPandaScoreClient.getSerieById).toHaveBeenCalledTimes(1);
        });

        it('should not call a team champion for winning one of several stages that start together', async () => {
            subscribe([111, 10]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ tournament_id: 98, tournament: stage(98, 'Group A', 10) }),
            ]);
            mockPandaScoreClient.getSerieById.mockResolvedValue(
                serieWithStages([98, '2024-03-01T00:00:00Z'], [97, '2024-03-01T00:00:00Z']),
            );

            await handleCron(mockEnv, CRON);

            expectNoTournamentMessage();
        });

        it('should hold off, and check again later, when the serie has no dates to order its stages by', async () => {
            subscribe([111, 10]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ tournament_id: 99, tournament: stage(99, 'Playoffs', 10) }),
            ]);
            mockPandaScoreClient.getSerieById.mockResolvedValue(serieWithStages([98, null], [99, null]));

            await handleCron(mockEnv, CRON);
            expectNoTournamentMessage();

            mockPandaScoreClient.getSerieById.mockResolvedValue(
                serieWithStages([98, '2024-03-01T00:00:00Z'], [99, '2024-03-10T00:00:00Z']),
            );
            await handleCron(mockEnv, CRON);

            expect(messagesTo(111)).toEqual([
                expect.stringContaining('Match Over'),
                expect.stringContaining('Champions!'),
            ]);
        });

        it('should hold off when the match does not say which serie it belongs to', async () => {
            subscribe([111, 10]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ serie_id: undefined, tournament_id: 99, tournament: stage(99, 'Playoffs', 10) }),
            ]);

            await handleCron(mockEnv, CRON);

            expectNoTournamentMessage();
        });

        it('should tell only the winner\'s followers about the title, and the runner-up\'s followers nothing about placing', async () => {
            subscribe([111, 10], [222, 20]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ tournament_id: 99, tournament: stage(99, 'Playoffs', 10) }),
            ]);

            await handleCron(mockEnv, CRON);

            expect(messagesTo(111)).toEqual([
                expect.stringContaining('Team Liquid</b> wins the series 2–1!'),
                expect.stringContaining('<b>Team Liquid</b> won the tournament!'),
            ]);
            expect(messagesTo(222)).toEqual([expect.stringContaining('Team Secret</b> lost the series 1–2.')]);
        });

        it('should name the event, not the stage, in the champion message', async () => {
            subscribe([111, 10]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ tournament_id: 99, tournament: stage(99, 'Playoffs', 10) }),
            ]);

            await handleCron(mockEnv, CRON);

            const champion = messagesTo(111)[1];
            expect(champion).toContain('ESL One - Spring 2024');
            expect(champion).not.toContain('Playoffs');
        });
    });

    describe('wording from the followed team\'s side', () => {
        it('should tell a Team Spirit follower that Team Spirit lost the map, not that the opponent won it', async () => {
            subscribe([111, 30]);
            mockPandaScoreClient.getRunningMatches.mockResolvedValue([
                buildMatch({
                    status: 'running',
                    winner: null,
                    games: [game(3001, 1, 40)],
                    opponents: [{ opponent: yandex, type: 'Team' }, { opponent: spirit, type: 'Team' }],
                }),
            ]);

            await handleCron(mockEnv, CRON);

            const [message] = messagesTo(111);
            expect(message).toContain('<b>Team Yandex</b> vs <b>Team Spirit</b>');
            expect(message).toContain('❌ <b>Team Spirit</b> lost Map 1.');
            expect(message).not.toContain('Team Yandex</b> wins');
        });

        it('should word the same map differently for followers of each side', async () => {
            subscribe([111, 30], [222, 40]);
            mockPandaScoreClient.getRunningMatches.mockResolvedValue([
                buildMatch({
                    status: 'running',
                    winner: null,
                    games: [game(3001, 1, 40)],
                    opponents: [{ opponent: yandex, type: 'Team' }, { opponent: spirit, type: 'Team' }],
                }),
            ]);

            await handleCron(mockEnv, CRON);

            expect(messagesTo(111)).toEqual([expect.stringContaining('❌ <b>Team Spirit</b> lost Map 1.')]);
            expect(messagesTo(222)).toEqual([expect.stringContaining('✅ <b>Team Yandex</b> wins Map 1!')]);
        });
    });

    describe('matches without a winner', () => {
        it('should announce a drawn series instead of waiting for a winner that never comes', async () => {
            subscribe([111, 10]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ winner: null, draw: true, games: [game(3001, 1, 10), game(3002, 2, 20)] }),
            ]);

            await handleCron(mockEnv, CRON);

            expect(messagesTo(111)).toEqual([expect.stringContaining('🤝 Series drawn 1–1.')]);
            expect(messagesTo(111)[0]).not.toContain('Unknown');
            expect(mockPandaScoreClient.getMatchById).not.toHaveBeenCalled();
        });

        it('should ignore a canceled match', async () => {
            subscribe([111, 10]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ status: 'canceled', winner: null, games: [] }),
            ]);

            await handleCron(mockEnv, CRON);

            expect(sendMessage).not.toHaveBeenCalled();
            expect(mockPandaScoreClient.getMatchById).not.toHaveBeenCalled();
        });
    });

    describe('step isolation', () => {
        it('should still announce results when the upcoming-matches request fails', async () => {
            subscribe([111, 10]);
            mockPandaScoreClient.getUpcomingMatches.mockRejectedValue(new Error('PandaScore API error: 500'));
            mockPandaScoreClient.getRunningMatches.mockResolvedValue([
                buildMatch({ id: 501, status: 'running', winner: null, games: [game(5011, 1, 10)] }),
            ]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([buildMatch()]);

            await expect(handleCron(mockEnv, CRON)).resolves.toBeUndefined();

            expect(messagesTo(111)).toEqual([
                expect.stringContaining('Map 1 Result'),
                expect.stringContaining('Match Over'),
            ]);
        });
    });
});
