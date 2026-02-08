import { handleCron } from '../src/cron';
import { Env } from '../src';
import { PandaScoreClient, Match } from '../src/pandascore';
import { getDb, Subscriber, TeamSubscription } from '../src/db/utils';
import { Telegraf } from 'telegraf';

jest.mock('../src/pandascore');
jest.mock('../src/db/utils');
jest.mock('telegraf');

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
        (PandaScoreClient as jest.Mock).mockImplementation(
            () => mockPandaScoreClient,
        );

        mockDb = {
            getAllSubscriptions: jest.fn(),
            getAllSubscribers: jest.fn(),
            getSubscribersByTeamId: jest.fn(),
        } as unknown as ReturnType<typeof getDb>;
        (getDb as jest.Mock).mockReturnValue(mockDb);

        mockBot = new (Telegraf as unknown as jest.Mock<Telegraf>)() as jest.Mocked<Telegraf>;
        mockBot.telegram = {
            sendMessage: jest.fn(),
        } as any;
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
        await handleCron(mockEnv, {} as ExecutionContext);
        expect(mockPandaScoreClient.getUpcomingMatches).not.toHaveBeenCalled();
    });

    it('should send notifications for upcoming matches', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [
            { id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() },
            { id: 2, subscriberId: 1, teamId: 20, teamName: 'Team Secret', createdAt: new Date().toISOString() },
        ];
        const mockAllSubscribers: Subscriber[] = [
            { id: 1, telegramId: 12345, createdAt: new Date().toISOString() },
        ];
        const matches: Match[] = [
            {
                id: 1,
                name: 'Match 1',
                begin_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                opponents: [
                    { opponent: { id: 10, name: 'Team A', acronym: null, image_url: null }, type: 'Team' },
                    { opponent: { id: 11, name: 'Team B', acronym: null, image_url: null }, type: 'Team' },
                ],
                league: { name: 'League 1', image_url: null },
                serie: { full_name: 'Serie 1' },
                status: 'not_started',
                end_at: null,
                results: [],
                streams_list: [],
            },
        ];

        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue(matches);
        (mockKv.get as jest.Mock).mockResolvedValue(null);

        await handleCron(mockEnv, {} as ExecutionContext);

        expect(mockPandaScoreClient.getUpcomingMatches).toHaveBeenCalledWith([
            10, 20,
        ]);
        expect(mockKv.get).toHaveBeenCalledWith('match_1');
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
            12345,
            expect.stringContaining('Upcoming Dota 2 Match!'),
            { parse_mode: 'HTML' },
        );
        expect(mockKv.put).toHaveBeenCalledWith('match_1', 'true', {
            expirationTtl: 86400,
        });
    });

    it('should not send notification if already sent', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [{ id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() }];
        const mockAllSubscribers: Subscriber[] = [{ id: 1, telegramId: 12345, createdAt: new Date().toISOString() }];
        const matches: Match[] = [
      {
          id: 1,
          name: 'Match 1',
          begin_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          opponents: [{ opponent: { id: 10 } }],
          league: { name: 'League 1' },
          serie: { full_name: 'Serie 1' },
      } as Match,
        ];
        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue(matches);
        (mockKv.get as jest.Mock).mockResolvedValue('true');

        await handleCron(mockEnv, {} as ExecutionContext);

        expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
        expect(mockKv.put).not.toHaveBeenCalled();
    });

    it('should not send notification for matches more than 30 minutes away', async () => {
        const mockAllSubscriptions: TeamSubscription[] = [{ id: 1, subscriberId: 1, teamId: 10, teamName: 'Team Liquid', createdAt: new Date().toISOString() }];
        const mockAllSubscribers: Subscriber[] = [{ id: 1, telegramId: 12345, createdAt: new Date().toISOString() }];
        const matches: Match[] = [
      {
          id: 1,
          name: 'Match 1',
          begin_at: new Date(Date.now() + 31 * 60 * 1000).toISOString(),
          opponents: [{ opponent: { id: 10 } }],
          league: { name: 'League 1' },
          serie: { full_name: 'Serie 1' },
      } as Match,
        ];
        (mockDb.getAllSubscriptions as jest.Mock).mockResolvedValue(mockAllSubscriptions);
        (mockDb.getAllSubscribers as jest.Mock).mockResolvedValue(mockAllSubscribers);
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue(matches);

        await handleCron(mockEnv, {} as ExecutionContext);

        expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
        expect(mockKv.put).not.toHaveBeenCalled();
    });
});
