import { handleCron } from '../src/cron';
import { Env } from '../src';
import { PandaScoreClient, Match } from '../src/pandascore';
import { getDb, Subscriber, TeamSubscription } from '../src/db/utils';
import { Telegraf } from 'telegraf';

jest.mock('../src/pandascore');
jest.mock('../src/db/utils');
jest.mock('telegraf');

const UPCOMING_CRON = '*/15 * * * *';
const LIVE_CRON = '*/1 * * * *';

describe('handleCron', () => {
    let mockEnv: Env;
    let mockD1: D1Database;
    let mockKv: KVNamespace;
    let mockPandaScoreClient: jest.Mocked<PandaScoreClient>;
    let mockDb: ReturnType<typeof getDb>;
    let mockBot: jest.Mocked<Telegraf>;

    beforeEach(() => {
        mockD1 = {
            prepare: jest.fn().mockReturnThis(),
            all: jest.fn(),
        } as unknown as D1Database;

        mockKv = {
            get: jest.fn(),
            put: jest.fn(),
        } as unknown as KVNamespace;

        mockPandaScoreClient = new (PandaScoreClient as jest.Mock<PandaScoreClient>)() as jest.Mocked<PandaScoreClient>;
        (PandaScoreClient as jest.Mock).mockImplementation(() => mockPandaScoreClient);

        mockDb = {
            getAllSubscriptions: jest.fn(),
            getAllSubscribers: jest.fn(),
            getSubscribersByTeamId: jest.fn(),
        } as unknown as ReturnType<typeof getDb>;
        (getDb as jest.Mock).mockReturnValue(mockDb);

        mockBot = new (Telegraf as unknown as jest.Mock<Telegraf>)() as jest.Mocked<Telegraf>;
        mockBot.telegram = { sendMessage: jest.fn() } as any;
        (Telegraf as unknown as jest.Mock).mockImplementation(() => mockBot);

        mockEnv = {
            D1: mockD1,
            NOTIFICATIONS_KV: mockKv,
        } as Env;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should not run if there are no subscriptions', async () => {
        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue([]);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue([]);

        await handleCron(mockEnv, LIVE_CRON);

        expect(mockPandaScoreClient.getRunningMatches).not.toHaveBeenCalled();
        expect(mockPandaScoreClient.getUpcomingMatches).not.toHaveBeenCalled();
    });

    // --- Upcoming match tests (15-min cron) ---

    it('should send notifications for upcoming matches', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [
            { id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() },
            { id: 2, subscriberId: 1, teamId: 20, teamName: 'Team Secret', createdAt: new Date().toISOString() },
        ];
        const mockAllSubscribers: Subscriber[] = [
            { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() },
        ];
        const matches: Match[] = [
            {
                id: 1,
                name: 'Match 1',
                begin_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                end_at: null,
                status: 'not_started',
                games: [],
                opponents: [
                    { opponent: { id: 10, name: 'Team A', acronym: null, image_url: null }, type: 'Team' },
                    { opponent: { id: 11, name: 'Team B', acronym: null, image_url: null }, type: 'Team' },
                ],
                league: { name: 'League 1', image_url: null },
                serie: { full_name: 'Serie 1' },
                results: [],
                streams_list: [],
            },
        ];

        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue(matches);
        (mockKv.get as jest.Mock).mockResolvedValue(null);

        await handleCron(mockEnv, UPCOMING_CRON);

        expect(mockPandaScoreClient.getUpcomingMatches).toHaveBeenCalledWith([10, 20]);
        expect(mockKv.get).toHaveBeenCalledWith('match_1');
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
            12345,
            expect.stringContaining('Upcoming Dota 2 Match!'),
            { parse_mode: 'HTML' },
        );
        expect(mockKv.put).toHaveBeenCalledWith('match_1', 'true', { expirationTtl: 86400 });
    });

    it('should not send notification if upcoming match already notified', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [
            { id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() },
        ];
        const mockAllSubscribers: Subscriber[] = [
            { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() },
        ];
        const matches: Match[] = [
            {
                id: 1,
                name: 'Match 1',
                begin_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                games: [],
                opponents: [{ opponent: { id: 10, name: 'Team A', acronym: null, image_url: null }, type: 'Team' }],
                league: { name: 'League 1', image_url: null },
                serie: { full_name: 'Serie 1' },
            } as Match,
        ];

        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue(matches);
        (mockKv.get as jest.Mock).mockImplementation((key: string) => {
            if (key === 'match_1') return Promise.resolve('true');
            return Promise.resolve(null);
        });

        await handleCron(mockEnv, UPCOMING_CRON);

        expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
        expect(mockKv.put).not.toHaveBeenCalled();
    });

    it('should not send notification for matches more than 30 minutes away', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [
            { id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() },
        ];
        const mockAllSubscribers: Subscriber[] = [
            { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() },
        ];
        const matches: Match[] = [
            {
                id: 1,
                name: 'Match 1',
                begin_at: new Date(Date.now() + 31 * 60 * 1000).toISOString(),
                games: [],
                opponents: [{ opponent: { id: 10, name: 'Team A', acronym: null, image_url: null }, type: 'Team' }],
                league: { name: 'League 1', image_url: null },
                serie: { full_name: 'Serie 1' },
            } as Match,
        ];

        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue(matches);
        (mockKv.get as jest.Mock).mockResolvedValue(null);

        await handleCron(mockEnv, UPCOMING_CRON);

        expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
        expect(mockKv.put).not.toHaveBeenCalled();
    });

    // --- Live match / per-map tests (1-min cron) ---

    it('should send per-map notification for a finished game in a running match', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [
            { id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() },
        ];
        const mockAllSubscribers: Subscriber[] = [
            { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() },
        ];
        const runningMatch: Match = {
            id: 100,
            name: 'Match 100',
            status: 'running',
            begin_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
            end_at: null,
            games: [
                {
                    id: 1001,
                    position: 1,
                    status: 'finished',
                    winner: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null },
                    winner_type: 'Team',
                    length: 2400,
                    begin_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
                    end_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
                },
            ],
            opponents: [
                { opponent: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null }, type: 'Team' },
                { opponent: { id: 20, name: 'Team Secret', acronym: 'Secret', image_url: null }, type: 'Team' },
            ],
            results: [
                { score: 1, opponent_id: 10 },
                { score: 0, opponent_id: 20 },
            ],
            league: { name: 'ESL One', image_url: null },
            serie: { full_name: 'Spring 2024' },
            streams_list: [],
        };

        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getRunningMatches.mockResolvedValue([runningMatch]);
        mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([]);
        (mockKv.get as jest.Mock).mockResolvedValue(null);

        await handleCron(mockEnv, LIVE_CRON);

        expect(mockPandaScoreClient.getRunningMatches).toHaveBeenCalledWith([10]);
        expect(mockKv.get).toHaveBeenCalledWith('game_100_1001');
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
            12345,
            expect.stringContaining('Map 1 Result'),
            { parse_mode: 'HTML' },
        );
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
            12345,
            expect.stringContaining('wins Map 1!'),
            { parse_mode: 'HTML' },
        );
        expect(mockKv.put).toHaveBeenCalledWith('game_100_1001', 'true', { expirationTtl: 86400 });
    });

    it('should not re-send per-map notification if already sent', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [
            { id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() },
        ];
        const mockAllSubscribers: Subscriber[] = [
            { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() },
        ];
        const runningMatch: Match = {
            id: 100,
            name: 'Match 100',
            status: 'running',
            begin_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
            end_at: null,
            games: [
                {
                    id: 1001,
                    position: 1,
                    status: 'finished',
                    winner: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null },
                    winner_type: 'Team',
                    length: 2400,
                    begin_at: null,
                    end_at: null,
                },
            ],
            opponents: [
                { opponent: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null }, type: 'Team' },
                { opponent: { id: 20, name: 'Team Secret', acronym: 'Secret', image_url: null }, type: 'Team' },
            ],
            results: [{ score: 1, opponent_id: 10 }, { score: 0, opponent_id: 20 }],
            league: { name: 'ESL One', image_url: null },
            serie: { full_name: 'Spring 2024' },
            streams_list: [],
        };

        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getRunningMatches.mockResolvedValue([runningMatch]);
        mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([]);
        (mockKv.get as jest.Mock).mockImplementation((key: string) => {
            if (key === 'game_100_1001') return Promise.resolve('true');
            return Promise.resolve(null);
        });

        await handleCron(mockEnv, LIVE_CRON);

        expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
        expect(mockKv.put).not.toHaveBeenCalled();
    });

    // --- Final match result tests ---

    it('should send final match result notification when a match finishes', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [
            { id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() },
        ];
        const mockAllSubscribers: Subscriber[] = [
            { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() },
        ];
        const finishedMatch: Match = {
            id: 200,
            name: 'Match 200',
            status: 'finished',
            begin_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
            end_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
            games: [],
            opponents: [
                { opponent: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null }, type: 'Team' },
                { opponent: { id: 20, name: 'Team Secret', acronym: 'Secret', image_url: null }, type: 'Team' },
            ],
            results: [
                { score: 2, opponent_id: 10 },
                { score: 1, opponent_id: 20 },
            ],
            league: { name: 'ESL One', image_url: null },
            serie: { full_name: 'Spring 2024' },
            streams_list: [],
        };

        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getRunningMatches.mockResolvedValue([]);
        mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([finishedMatch]);
        (mockKv.get as jest.Mock).mockResolvedValue(null);

        await handleCron(mockEnv, LIVE_CRON);

        expect(mockPandaScoreClient.getRecentlyFinishedMatches).toHaveBeenCalledWith([10]);
        expect(mockKv.get).toHaveBeenCalledWith('match_final_200');
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
            12345,
            expect.stringContaining('Match Over'),
            { parse_mode: 'HTML' },
        );
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
            12345,
            expect.stringContaining('wins the series 2–1'),
            { parse_mode: 'HTML' },
        );
        expect(mockKv.put).toHaveBeenCalledWith('match_final_200', 'true', { expirationTtl: 86400 });
    });

    it('should not re-send final result if already notified', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [
            { id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() },
        ];
        const mockAllSubscribers: Subscriber[] = [
            { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() },
        ];
        const finishedMatch: Match = {
            id: 200,
            name: 'Match 200',
            status: 'finished',
            begin_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
            end_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
            games: [],
            opponents: [
                { opponent: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null }, type: 'Team' },
                { opponent: { id: 20, name: 'Team Secret', acronym: 'Secret', image_url: null }, type: 'Team' },
            ],
            results: [{ score: 2, opponent_id: 10 }, { score: 0, opponent_id: 20 }],
            league: { name: 'ESL One', image_url: null },
            serie: { full_name: 'Spring 2024' },
            streams_list: [],
        };

        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getRunningMatches.mockResolvedValue([]);
        mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([finishedMatch]);
        (mockKv.get as jest.Mock).mockImplementation((key: string) => {
            if (key === 'match_final_200') return Promise.resolve('true');
            return Promise.resolve(null);
        });

        await handleCron(mockEnv, LIVE_CRON);

        expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
        expect(mockKv.put).not.toHaveBeenCalled();
    });

    it('should skip games that are not yet finished', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [
            { id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() },
        ];
        const mockAllSubscribers: Subscriber[] = [
            { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() },
        ];
        const runningMatch: Match = {
            id: 100,
            name: 'Match 100',
            status: 'running',
            begin_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
            end_at: null,
            games: [
                {
                    id: 1001,
                    position: 1,
                    status: 'running',
                    winner: null,
                    winner_type: null,
                    length: null,
                    begin_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
                    end_at: null,
                },
            ],
            opponents: [
                { opponent: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null }, type: 'Team' },
                { opponent: { id: 20, name: 'Team Secret', acronym: 'Secret', image_url: null }, type: 'Team' },
            ],
            results: [{ score: 0, opponent_id: 10 }, { score: 0, opponent_id: 20 }],
            league: { name: 'ESL One', image_url: null },
            serie: { full_name: 'Spring 2024' },
            streams_list: [],
        };

        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getRunningMatches.mockResolvedValue([runningMatch]);
        mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([]);
        (mockKv.get as jest.Mock).mockResolvedValue(null);

        await handleCron(mockEnv, LIVE_CRON);

        expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
        expect(mockKv.put).not.toHaveBeenCalled();
    });
});
