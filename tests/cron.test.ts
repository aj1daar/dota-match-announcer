import { handleCron } from '../src/cron';
import { Env } from '../src';
import { PandaScoreClient, Match, GameWinner } from '../src/pandascore';
import { getDb, Subscriber, TeamSubscription } from '../src/db/utils';
import { Telegraf } from 'telegraf';

jest.mock('../src/pandascore');
jest.mock('../src/db/utils');
jest.mock('telegraf');

const LIVE_CRON = '*/1 * * * *';
const UPCOMING_CRON = LIVE_CRON;

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
        /*
         * PandaScoreClient is automocked, so its methods live as shared jest.fn()
         * on the mocked prototype - clearAllMocks() resets call history but NOT
         * mockResolvedValue, so without this default, a value set by an earlier
         * test would otherwise leak into every test that doesn't override it.
         */
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue([]);
        mockPandaScoreClient.getRunningMatches.mockResolvedValue([]);
        mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([]);

        mockDb = {
            getAllSubscriptions: jest.fn(),
            getAllSubscribers: jest.fn(),
            getSubscribersByTeamId: jest.fn(),
        } as unknown as ReturnType<typeof getDb>;
        (getDb as jest.Mock).mockReturnValue(mockDb);

        mockBot = new (Telegraf as unknown as jest.Mock<Telegraf>)() as jest.Mocked<Telegraf>;
        mockBot.telegram = { sendMessage: jest.fn(), sendDocument: jest.fn() } as any;
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
                begin_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                end_at: null,
                status: 'not_started',
                winner: null,
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

    it('should not attach a calendar file to the starting-soon reminder on its own', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [
            { id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() },
        ];
        const mockAllSubscribers: Subscriber[] = [
            { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() },
        ];
        const matches: Match[] = [
            {
                id: 2,
                name: 'Match 2',
                begin_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                end_at: null,
                status: 'not_started',
                winner: null,
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
        (mockKv.get as jest.Mock).mockImplementation((key: string) => {
            // Already announced as a new match earlier - only the reminder should fire now.
            if (key === 'match_announced_known_2') return Promise.resolve('true');
            return Promise.resolve(null);
        });

        await handleCron(mockEnv, UPCOMING_CRON);

        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
            12345,
            expect.stringContaining('Upcoming Dota 2 Match!'),
            { parse_mode: 'HTML' },
        );
        expect(mockBot.telegram.sendDocument).not.toHaveBeenCalled();
    });

    // --- "As soon as it's known" new-match announcement ---

    it('should announce a newly seen match with a known opponent right away, regardless of how far off it is', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [
            { id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() },
        ];
        const mockAllSubscribers: Subscriber[] = [
            { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() },
        ];
        const matches: Match[] = [
            {
                id: 500,
                name: 'Upper Bracket Final',
                begin_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
                end_at: null,
                status: 'not_started',
                winner: null,
                games: [],
                opponents: [
                    { opponent: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null }, type: 'Team' },
                    { opponent: { id: 20, name: 'Team Secret', acronym: 'Secret', image_url: null }, type: 'Team' },
                ],
                league: { name: 'ESL One', image_url: null },
                serie: { full_name: 'Spring 2024' },
                results: [],
                streams_list: [],
            },
        ];

        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue(matches);
        (mockKv.get as jest.Mock).mockResolvedValue(null);

        await handleCron(mockEnv, LIVE_CRON);

        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
            12345,
            expect.stringContaining('New Match Scheduled'),
            { parse_mode: 'HTML' },
        );
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
            12345,
            expect.stringContaining('Team Liquid vs Team Secret'),
            { parse_mode: 'HTML' },
        );
        expect(mockKv.put).toHaveBeenCalledWith('match_announced_known_500', 'true', { expirationTtl: 2592000 });

        expect(mockBot.telegram.sendDocument).toHaveBeenCalledTimes(1);
        const [chatId, document] = (mockBot.telegram.sendDocument as jest.Mock).mock.calls[0];
        expect(chatId).toEqual(12345);
        expect(document.filename).toEqual('match-500.ics');
        const ics = (document.source as Buffer).toString('utf-8');
        expect(ics).toContain('BEGIN:VCALENDAR');
        expect(ics).toContain('SUMMARY:Team Liquid vs Team Secret - ESL One');
    });

    it('should announce advancement without mentioning the opponent when only one side of the match is set', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [
            { id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() },
        ];
        const mockAllSubscribers: Subscriber[] = [
            { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() },
        ];
        const matches: Match[] = [
            {
                id: 501,
                name: 'Lower Bracket Round 3',
                begin_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                end_at: null,
                status: 'not_started',
                winner: null,
                games: [],
                opponents: [
                    { opponent: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null }, type: 'Team' },
                ],
                league: { name: 'ESL One', image_url: null },
                serie: { full_name: 'Spring 2024' },
                results: [],
                streams_list: [],
            } as unknown as Match,
        ];

        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue(matches);
        (mockKv.get as jest.Mock).mockResolvedValue(null);

        await handleCron(mockEnv, LIVE_CRON);

        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
            12345,
            expect.stringContaining('Team Liquid'),
            { parse_mode: 'HTML' },
        );
        expect(mockBot.telegram.sendMessage).not.toHaveBeenCalledWith(
            12345,
            expect.stringContaining('unknown'),
            expect.anything(),
        );
        expect(mockBot.telegram.sendMessage).not.toHaveBeenCalledWith(
            12345,
            expect.stringContaining('TBD'),
            expect.anything(),
        );
        expect(mockKv.put).toHaveBeenCalledWith('match_announced_tbd_501', 'true', { expirationTtl: 2592000 });

        expect(mockBot.telegram.sendDocument).toHaveBeenCalledTimes(1);
        const [, document] = (mockBot.telegram.sendDocument as jest.Mock).mock.calls[0];
        const ics = (document.source as Buffer).toString('utf-8');
        expect(ics).toContain('SUMMARY:Team Liquid - Next Match (ESL One)');
        expect(ics).not.toContain('unknown');
        expect(ics).not.toContain('TBD');
    });

    it('should not crash when a TBD slot is a present opponents entry with a null opponent', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [
            { id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() },
        ];
        const mockAllSubscribers: Subscriber[] = [
            { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() },
        ];
        const matches: Match[] = [
            {
                id: 504,
                name: 'Lower Bracket Round 3',
                begin_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                end_at: null,
                status: 'not_started',
                winner: null,
                games: [],
                // PandaScore sometimes reserves both slots up front, leaving the TBD side null rather than omitting it.
                opponents: [
                    { opponent: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null }, type: 'Team' },
                    { opponent: null, type: 'Team' },
                ],
                league: { name: 'ESL One', image_url: null },
                serie: { full_name: 'Spring 2024' },
                results: [],
                streams_list: [],
            } as Match,
        ];

        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue(matches);
        (mockKv.get as jest.Mock).mockResolvedValue(null);

        await expect(handleCron(mockEnv, LIVE_CRON)).resolves.toBeUndefined();

        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
            12345,
            expect.stringContaining('advances to the next round'),
            { parse_mode: 'HTML' },
        );
        expect(mockKv.put).toHaveBeenCalledWith('match_announced_tbd_504', 'true', { expirationTtl: 2592000 });
    });

    it('should announce the confirmed opponent once it resolves, even after the TBD announcement already fired', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [
            { id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() },
        ];
        const mockAllSubscribers: Subscriber[] = [
            { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() },
        ];
        const matches: Match[] = [
            {
                id: 502,
                name: 'Lower Bracket Round 3',
                begin_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                end_at: null,
                status: 'not_started',
                winner: null,
                games: [],
                opponents: [
                    { opponent: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null }, type: 'Team' },
                    { opponent: { id: 30, name: 'Team Aster', acronym: 'Aster', image_url: null }, type: 'Team' },
                ],
                league: { name: 'ESL One', image_url: null },
                serie: { full_name: 'Spring 2024' },
                results: [],
                streams_list: [],
            },
        ];

        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue(matches);
        (mockKv.get as jest.Mock).mockImplementation((key: string) => {
            // The TBD version of this match was already announced on an earlier tick.
            if (key === 'match_announced_tbd_502') return Promise.resolve('true');
            return Promise.resolve(null);
        });

        await handleCron(mockEnv, LIVE_CRON);

        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
            12345,
            expect.stringContaining('Opponent Revealed'),
            { parse_mode: 'HTML' },
        );
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
            12345,
            expect.stringContaining('Team Liquid vs Team Aster'),
            { parse_mode: 'HTML' },
        );
        expect(mockBot.telegram.sendMessage).not.toHaveBeenCalledWith(
            12345,
            expect.stringContaining('New Match Scheduled'),
            expect.anything(),
        );
        expect(mockKv.put).toHaveBeenCalledWith('match_announced_known_502', 'true', { expirationTtl: 2592000 });
    });

    it('should not re-announce a match that was already announced with a known opponent', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [
            { id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() },
        ];
        const mockAllSubscribers: Subscriber[] = [
            { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() },
        ];
        const matches: Match[] = [
            {
                id: 503,
                name: 'Lower Bracket Round 3',
                begin_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                end_at: null,
                status: 'not_started',
                winner: null,
                games: [],
                opponents: [
                    { opponent: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null }, type: 'Team' },
                    { opponent: { id: 30, name: 'Team Aster', acronym: 'Aster', image_url: null }, type: 'Team' },
                ],
                league: { name: 'ESL One', image_url: null },
                serie: { full_name: 'Spring 2024' },
                results: [],
                streams_list: [],
            },
        ];

        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue(matches);
        (mockKv.get as jest.Mock).mockImplementation((key: string) => {
            if (key === 'match_announced_known_503') return Promise.resolve('true');
            return Promise.resolve(null);
        });

        await handleCron(mockEnv, LIVE_CRON);

        expect(mockBot.telegram.sendMessage).not.toHaveBeenCalledWith(
            12345,
            expect.stringContaining('New Match Scheduled'),
            expect.anything(),
        );
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
                opponents: [
                    { opponent: { id: 10, name: 'Team A', acronym: null, image_url: null }, type: 'Team' },
                    { opponent: { id: 11, name: 'Team B', acronym: null, image_url: null }, type: 'Team' },
                ],
                league: { name: 'League 1', image_url: null },
                serie: { full_name: 'Serie 1' },
            } as unknown as Match,
        ];

        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue(matches);
        (mockKv.get as jest.Mock).mockImplementation((key: string) => {
            if (key === 'match_1') return Promise.resolve('true');
            if (key === 'match_announced_known_1') return Promise.resolve('true');
            return Promise.resolve(null);
        });

        await handleCron(mockEnv, UPCOMING_CRON);

        expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
        expect(mockKv.put).not.toHaveBeenCalled();
    });

    it('should not send the starting-soon reminder for matches more than 10 minutes away (new-match announcement still fires)', async () => {
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
                begin_at: new Date(Date.now() + 11 * 60 * 1000).toISOString(),
                games: [],
                opponents: [
                    { opponent: { id: 10, name: 'Team A', acronym: null, image_url: null }, type: 'Team' },
                    { opponent: { id: 11, name: 'Team B', acronym: null, image_url: null }, type: 'Team' },
                ],
                league: { name: 'League 1', image_url: null },
                serie: { full_name: 'Serie 1' },
            } as unknown as Match,
        ];

        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue(matches);
        (mockKv.get as jest.Mock).mockResolvedValue(null);

        await handleCron(mockEnv, UPCOMING_CRON);

        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
            12345,
            expect.stringContaining('New Match Scheduled'),
            { parse_mode: 'HTML' },
        );
        expect(mockBot.telegram.sendMessage).not.toHaveBeenCalledWith(
            12345,
            expect.stringContaining('Upcoming Dota 2 Match!'),
            expect.anything(),
        );
        expect(mockKv.put).not.toHaveBeenCalledWith('match_1', 'true', expect.anything());
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
            winner: null,
            games: [
                {
                    id: 1001,
                    position: 1,
                    status: 'finished',
                    winner: { id: 10, type: 'Team' } as GameWinner,
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
                { score: 1, team_id: 10 },
                { score: 0, team_id: 20 },
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

    it('should resolve winner name from opponents since game.winner only has id and type', async () => {
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
            winner: null,
            games: [
                {
                    id: 1001,
                    position: 1,
                    status: 'finished',
                    winner: { id: 10, type: 'Team' } as GameWinner,
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
            results: [{ score: 0, team_id: 10 }, { score: 0, team_id: 20 }],
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

        const msg = (mockBot.telegram.sendMessage as jest.Mock).mock.calls[0][1] as string;
        expect(msg).toContain('Team Liquid');
        expect(msg).not.toContain('Unknown');
    });

    it('should compute series score from games array, not match.results', async () => {
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
            winner: null,
            games: [
                {
                    id: 1001,
                    position: 1,
                    status: 'finished',
                    winner: { id: 10, type: 'Team' } as GameWinner,
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
            // Results stale — score must still be computed from games above
            results: [{ score: 0, team_id: 10 }, { score: 0, team_id: 20 }],
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

        const msg = (mockBot.telegram.sendMessage as jest.Mock).mock.calls[0][1] as string;
        expect(msg).toContain('Team Liquid 1 – 0 Team Secret');
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
            winner: null,
            games: [
                {
                    id: 1001,
                    position: 1,
                    status: 'finished',
                    winner: { id: 10, type: 'Team' } as GameWinner,
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
            results: [{ score: 1, team_id: 10 }, { score: 0, team_id: 20 }],
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
            winner: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null },
            games: [
                { id: 2001, position: 1, status: 'finished', winner: { id: 10, type: 'Team' } as GameWinner, winner_type: 'Team', length: 2400, begin_at: null, end_at: null },
                { id: 2002, position: 2, status: 'finished', winner: { id: 20, type: 'Team' } as GameWinner, winner_type: 'Team', length: 2100, begin_at: null, end_at: null },
                { id: 2003, position: 3, status: 'finished', winner: { id: 10, type: 'Team' } as GameWinner, winner_type: 'Team', length: 1800, begin_at: null, end_at: null },
            ],
            opponents: [
                { opponent: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null }, type: 'Team' },
                { opponent: { id: 20, name: 'Team Secret', acronym: 'Secret', image_url: null }, type: 'Team' },
            ],
            results: [
                { score: 2, team_id: 10 },
                { score: 1, team_id: 20 },
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
            winner: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null },
            games: [],
            opponents: [
                { opponent: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null }, type: 'Team' },
                { opponent: { id: 20, name: 'Team Secret', acronym: 'Secret', image_url: null }, type: 'Team' },
            ],
            results: [{ score: 2, team_id: 10 }, { score: 0, team_id: 20 }],
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

    describe('result wording and champion announcement', () => {
        const liquid = { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null };
        const secret = { id: 20, name: 'Team Secret', acronym: 'Secret', image_url: null };
        const game = (id: number, position: number, winnerId: number) => ({
            id,
            position,
            status: 'finished' as const,
            winner: { id: winnerId, type: 'Team' } as GameWinner,
            winner_type: 'Team' as const,
            length: 2400,
            begin_at: null,
            end_at: null,
        });
        const buildMatch = (overrides: Partial<Match>): Match => ({
            id: 300,
            name: 'Grand Final',
            status: 'finished',
            begin_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
            end_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
            winner: liquid,
            games: [game(3001, 1, 10), game(3002, 2, 20), game(3003, 3, 10)],
            opponents: [
                { opponent: liquid, type: 'Team' },
                { opponent: secret, type: 'Team' },
            ],
            results: [{ score: 2, team_id: 10 }, { score: 1, team_id: 20 }],
            league: { name: 'ESL One', image_url: null },
            serie_id: 7,
            serie: { full_name: 'Spring 2024', winner_id: null },
            streams_list: [],
            ...overrides,
        });
        const playoffs = (winnerId: number | null) => ({
            id: 99,
            name: 'Playoffs',
            has_bracket: true,
            winner_id: winnerId,
            winner_type: winnerId ? ('Team' as const) : null,
            end_at: null,
        });
        const serieWithStages = (...stages: Array<[number, string]>) => ({
            id: 7,
            winner_id: null,
            tournaments: stages.map(([id, begin_at]) => ({ id, begin_at, end_at: null })),
        });
        const subscribe = (...pairs: Array<[number, number]>) => {
            const telegramIds = Array.from(new Set(pairs.map(([telegramId]) => telegramId)));
            (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(
                telegramIds.map((telegramId, i) => ({
                    id: i + 1, telegramId, timezone: 'UTC', createdAt: new Date().toISOString(),
                })),
            );
            (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(
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
            (mockBot.telegram.sendMessage as jest.Mock).mock.calls
                .filter(call => call[0] === telegramId)
                .map(call => call[1] as string);

        beforeEach(() => {
            (mockKv.get as jest.Mock).mockResolvedValue(null);
        });

        it('should word a lost map from the followed team\'s side', async () => {
            subscribe([222, 20]);
            mockPandaScoreClient.getRunningMatches.mockResolvedValue([
                buildMatch({ status: 'running', winner: null, games: [game(3001, 1, 10)] }),
            ]);

            await handleCron(mockEnv, LIVE_CRON);

            const [message] = messagesTo(222);
            expect(message).toContain('❌ <b>Team Secret</b> lost Map 1.');
            expect(message).not.toContain('wins Map 1');
        });

        it('should keep neutral map wording for a subscriber who follows both teams, and send it once', async () => {
            subscribe([111, 10], [111, 20]);
            mockPandaScoreClient.getRunningMatches.mockResolvedValue([
                buildMatch({ status: 'running', winner: null, games: [game(3001, 1, 10)] }),
            ]);

            await handleCron(mockEnv, LIVE_CRON);

            expect(messagesTo(111)).toHaveLength(1);
            expect(messagesTo(111)[0]).toContain('✅ <b>Team Liquid</b> wins Map 1!');
        });

        it('should word the final result per recipient when each follows a different side', async () => {
            subscribe([111, 10], [222, 20]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([buildMatch({})]);

            await handleCron(mockEnv, LIVE_CRON);

            expect(messagesTo(111)).toEqual([expect.stringContaining('🏆 <b>Team Liquid</b> wins the series 2–1!')]);
            expect(messagesTo(222)).toEqual([expect.stringContaining('💔 <b>Team Secret</b> lost the series 1–2.')]);
        });

        it('should announce the champion when the followed team wins the last stage of the serie', async () => {
            subscribe([111, 10]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ tournament_id: 99, tournament: playoffs(10) }),
            ]);
            mockPandaScoreClient.getSerieById.mockResolvedValue(
                serieWithStages([98, '2024-03-01T00:00:00Z'], [99, '2024-03-10T00:00:00Z']),
            );

            await handleCron(mockEnv, LIVE_CRON);

            expect(mockPandaScoreClient.getSerieById).toHaveBeenCalledWith(7);
            expect(messagesTo(111)).toContainEqual(expect.stringContaining('won the tournament'));
            expect(messagesTo(111)).toContainEqual(expect.stringContaining('ESL One - Spring 2024'));
            expect(mockKv.put).toHaveBeenCalledWith('tournament_result_99_10', 'true', { expirationTtl: 2592000 });
        });

        it('should not announce a champion for winning a stage that is not the last one', async () => {
            subscribe([111, 10]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ tournament_id: 98, tournament: { ...playoffs(10), id: 98, name: 'Group Stage' } }),
            ]);
            mockPandaScoreClient.getSerieById.mockResolvedValue(
                serieWithStages([98, '2024-03-01T00:00:00Z'], [99, '2024-03-10T00:00:00Z']),
            );

            await handleCron(mockEnv, LIVE_CRON);

            expect(messagesTo(111)).toHaveLength(1);
            expect(messagesTo(111)[0]).toContain('Match Over');
            expect(mockKv.put).toHaveBeenCalledWith('tournament_not_final_98', 'true', { expirationTtl: 86400 });
        });

        it('should announce the champion without a serie lookup when the serie itself names the winner', async () => {
            subscribe([111, 10]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({
                    tournament_id: 99,
                    tournament: playoffs(null),
                    serie: { full_name: 'Spring 2024', winner_id: 10 },
                }),
            ]);

            await handleCron(mockEnv, LIVE_CRON);

            expect(mockPandaScoreClient.getSerieById).not.toHaveBeenCalled();
            expect(messagesTo(111)).toContainEqual(expect.stringContaining('Champions!'));
        });

        it('should never send a placement message, even for a team beaten in the final stage', async () => {
            subscribe([222, 20]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ tournament_id: 99, tournament: playoffs(10) }),
            ]);

            await handleCron(mockEnv, LIVE_CRON);

            expect(messagesTo(222)).toHaveLength(1);
            expect(messagesTo(222)[0]).not.toContain('finished in place');
            expect(mockPandaScoreClient.getSerieById).not.toHaveBeenCalled();
        });

        it('should not announce a champion while the tournament has no winner yet', async () => {
            subscribe([111, 10]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ tournament_id: 99, tournament: playoffs(null) }),
            ]);

            await handleCron(mockEnv, LIVE_CRON);

            expect(messagesTo(111)).toHaveLength(1);
            expect(mockPandaScoreClient.getSerieById).not.toHaveBeenCalled();
        });

        it('should announce the champion on a later run once the winner is published, without repeating the match result', async () => {
            subscribe([111, 10]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ tournament_id: 99, tournament: playoffs(10) }),
            ]);
            mockPandaScoreClient.getSerieById.mockResolvedValue(serieWithStages([99, '2024-03-10T00:00:00Z']));
            (mockKv.get as jest.Mock).mockImplementation((key: string) =>
                Promise.resolve(key === 'match_final_300' ? 'true' : null),
            );

            await handleCron(mockEnv, LIVE_CRON);

            expect(messagesTo(111)).toEqual([expect.stringContaining('Champions!')]);
        });

        it('should not re-announce a champion that was already announced', async () => {
            subscribe([111, 10]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ tournament_id: 99, tournament: playoffs(10) }),
            ]);
            (mockKv.get as jest.Mock).mockResolvedValue('true');

            await handleCron(mockEnv, LIVE_CRON);

            expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
            expect(mockPandaScoreClient.getSerieById).not.toHaveBeenCalled();
        });

        it('should still send the final match result and retry later if the serie lookup fails', async () => {
            subscribe([111, 10]);
            mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([
                buildMatch({ tournament_id: 99, tournament: playoffs(10) }),
            ]);
            mockPandaScoreClient.getSerieById.mockRejectedValue(new Error('PandaScore API error: 404 Not Found'));

            await handleCron(mockEnv, LIVE_CRON);

            expect(messagesTo(111)).toEqual([expect.stringContaining('Match Over')]);
            expect(mockKv.put).toHaveBeenCalledTimes(1);
            expect(mockKv.put).toHaveBeenCalledWith('match_final_300', 'true', { expirationTtl: 86400 });
        });
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
            winner: null,
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
            results: [{ score: 0, team_id: 10 }, { score: 0, team_id: 20 }],
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

    it('should retry getMatchById when match.winner is null and send once winner is available', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [
            { id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() },
        ];
        const mockAllSubscribers: Subscriber[] = [
            { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() },
        ];
        const finishedMatchNoWinner: Match = {
            id: 300,
            name: 'Match 300',
            status: 'finished',
            begin_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
            end_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            winner: null,
            games: [],
            opponents: [
                { opponent: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null }, type: 'Team' },
                { opponent: { id: 20, name: 'Team Secret', acronym: 'Secret', image_url: null }, type: 'Team' },
            ],
            results: [],
            league: { name: 'ESL One', image_url: null },
            serie: { full_name: 'Spring 2024' },
            streams_list: [],
        };
        const finishedMatchWithWinner: Match = {
            ...finishedMatchNoWinner,
            winner: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null },
            games: [
                { id: 3001, position: 1, status: 'finished', winner: { id: 10, type: 'Team' } as GameWinner, winner_type: 'Team', length: 2400, begin_at: null, end_at: null },
                { id: 3002, position: 2, status: 'finished', winner: { id: 10, type: 'Team' } as GameWinner, winner_type: 'Team', length: 1800, begin_at: null, end_at: null },
            ],
        };

        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getRunningMatches.mockResolvedValue([]);
        mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([finishedMatchNoWinner]);
        mockPandaScoreClient.getMatchById.mockResolvedValue(finishedMatchWithWinner);
        (mockKv.get as jest.Mock).mockResolvedValue(null);

        await handleCron(mockEnv, LIVE_CRON);

        expect(mockPandaScoreClient.getMatchById).toHaveBeenCalledWith(300);
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
            12345,
            expect.stringContaining('Match Over'),
            { parse_mode: 'HTML' },
        );
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
            12345,
            expect.stringContaining('wins the series 2–0'),
            { parse_mode: 'HTML' },
        );
        expect(mockKv.put).toHaveBeenCalledWith('match_final_300', 'true', { expirationTtl: 86400 });
    });

    it('should skip match when winner still unavailable after getMatchById retry', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [
            { id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() },
        ];
        const mockAllSubscribers: Subscriber[] = [
            { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() },
        ];
        const finishedMatchNoWinner: Match = {
            id: 400,
            name: 'Match 400',
            status: 'finished',
            begin_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
            end_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
            winner: null,
            games: [],
            opponents: [
                { opponent: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null }, type: 'Team' },
                { opponent: { id: 20, name: 'Team Secret', acronym: 'Secret', image_url: null }, type: 'Team' },
            ],
            results: [],
            league: { name: 'ESL One', image_url: null },
            serie: { full_name: 'Spring 2024' },
            streams_list: [],
        };

        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getRunningMatches.mockResolvedValue([]);
        mockPandaScoreClient.getRecentlyFinishedMatches.mockResolvedValue([finishedMatchNoWinner]);
        mockPandaScoreClient.getMatchById.mockResolvedValue({ ...finishedMatchNoWinner, winner: null });
        (mockKv.get as jest.Mock).mockResolvedValue(null);

        await handleCron(mockEnv, LIVE_CRON);

        expect(mockPandaScoreClient.getMatchById).toHaveBeenCalledWith(400);
        expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
        expect(mockKv.put).not.toHaveBeenCalled();
    });
});
