import { teamScheduleCallback } from '../../../src/bot/callbacks/teamSchedule';
import { CustomContext } from '../../../src/bot/context';
import { getDb } from '../../../src/db/utils';
import { PandaScoreClient, Match } from '../../../src/pandascore';
import { Env } from '../../../src';

jest.mock('../../../src/db/utils');
jest.mock('../../../src/pandascore');

describe('teamScheduleCallback', () => {
    let mockCtx: Partial<CustomContext>;
    let mockEnv: Env;
    let mockDb: ReturnType<typeof getDb>;
    let mockPandaScoreClient: jest.Mocked<PandaScoreClient>;

    beforeEach(() => {
        mockEnv = {} as Env;

        mockDb = {
            getSubscriberByTelegramId: jest.fn(),
        } as unknown as ReturnType<typeof getDb>;
        (getDb as jest.Mock).mockReturnValue(mockDb);

        mockPandaScoreClient = new (PandaScoreClient as jest.Mock<PandaScoreClient>)() as jest.Mocked<PandaScoreClient>;
        (PandaScoreClient as jest.Mock).mockImplementation(() => mockPandaScoreClient);

        mockCtx = {
            from: { id: 12345, is_bot: false, first_name: 'Test' },
            env: mockEnv,
            answerCbQuery: jest.fn().mockResolvedValue(undefined),
            reply: jest.fn().mockResolvedValue(undefined),
            callbackQuery: {
                data: 'team_schedule:10:Team Liquid',
                id: 'cbq1',
                from: { id: 12345, is_bot: false, first_name: 'Test' },
                chat_instance: 'ci1',
            } as any,
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should reply with upcoming matches for the team', async () => {
        const subscriber = { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() };
        (mockDb.getSubscriberByTelegramId as jest.Mock).mockResolvedValue(subscriber);

        const matches: Match[] = [
            {
                id: 1,
                name: 'Match 1',
                status: 'not_started',
                begin_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
                end_at: null,
                number_of_games: 3,
                games: [],
                opponents: [
                    { opponent: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null }, type: 'Team' },
                    { opponent: { id: 20, name: 'Team Secret', acronym: 'Secret', image_url: null }, type: 'Team' },
                ],
                results: [],
                league: { name: 'ESL One', image_url: null },
                serie: { full_name: 'Spring 2024' },
                streams_list: [],
            },
        ];
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue(matches);

        await teamScheduleCallback(mockCtx as CustomContext);

        expect(mockPandaScoreClient.getUpcomingMatches).toHaveBeenCalledWith([10]);
        expect(mockCtx.reply).toHaveBeenCalledWith(
            expect.stringContaining('Upcoming matches for Team Liquid'),
            { parse_mode: 'HTML' },
        );
        expect(mockCtx.reply).toHaveBeenCalledWith(
            expect.stringContaining('Team Liquid vs Team Secret'),
            { parse_mode: 'HTML' },
        );
        expect(mockCtx.reply).toHaveBeenCalledWith(
            expect.stringContaining('BO3'),
            { parse_mode: 'HTML' },
        );
    });

    it('should reply with a no-matches message when there are no upcoming matches', async () => {
        const subscriber = { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() };
        (mockDb.getSubscriberByTelegramId as jest.Mock).mockResolvedValue(subscriber);
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue([]);

        await teamScheduleCallback(mockCtx as CustomContext);

        expect(mockCtx.reply).toHaveBeenCalledWith(
            expect.stringContaining('No upcoming matches found for'),
            { parse_mode: 'HTML' },
        );
    });

    it('should cap results at 5 matches', async () => {
        const subscriber = { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() };
        (mockDb.getSubscriberByTelegramId as jest.Mock).mockResolvedValue(subscriber);

        const matches: Match[] = Array.from({ length: 8 }, (_, i) => ({
            id: i + 1,
            name: `Match ${i + 1}`,
            status: 'not_started' as const,
            begin_at: new Date(Date.now() + (i + 1) * 60 * 60 * 1000).toISOString(),
            end_at: null,
            games: [],
            opponents: [
                { opponent: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null }, type: 'Team' as const },
                { opponent: { id: 20 + i, name: `Opponent ${i}`, acronym: null, image_url: null }, type: 'Team' as const },
            ],
            results: [],
            league: { name: 'ESL One', image_url: null },
            serie: { full_name: 'Spring 2024' },
            streams_list: [],
        }));
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue(matches);

        await teamScheduleCallback(mockCtx as CustomContext);

        const replyArg = (mockCtx.reply as jest.Mock).mock.calls[0][0] as string;
        const matchCount = (replyArg.match(/vs Opponent/g) || []).length;
        expect(matchCount).toBe(5);
    });

    it('should return an error if callback data is invalid', async () => {
        const from = mockCtx.from ?? { id: 12345, is_bot: false, first_name: 'Test' };
        mockCtx.callbackQuery = { data: 'team_schedule', id: 'cbq1', from, chat_instance: 'ci1' } as any;

        await teamScheduleCallback(mockCtx as CustomContext);

        expect(mockCtx.answerCbQuery).toHaveBeenCalledWith('Invalid callback data.');
        expect(mockCtx.reply).not.toHaveBeenCalled();
    });

    it('should use the subscriber timezone when formatting match times', async () => {
        const subscriber = { id: 1, telegramId: 12345, timezone: 'America/New_York', createdAt: new Date().toISOString() };
        (mockDb.getSubscriberByTelegramId as jest.Mock).mockResolvedValue(subscriber);

        const matches: Match[] = [
            {
                id: 1,
                name: 'Match 1',
                status: 'not_started',
                begin_at: '2025-01-15T18:00:00Z',
                end_at: null,
                games: [],
                opponents: [
                    { opponent: { id: 10, name: 'Team Liquid', acronym: 'TL', image_url: null }, type: 'Team' },
                    { opponent: { id: 20, name: 'Team Secret', acronym: 'Secret', image_url: null }, type: 'Team' },
                ],
                results: [],
                league: { name: 'ESL One', image_url: null },
                serie: { full_name: 'Spring 2024' },
                streams_list: [],
            },
        ];
        mockPandaScoreClient.getUpcomingMatches.mockResolvedValue(matches);

        await teamScheduleCallback(mockCtx as CustomContext);

        const replyArg = (mockCtx.reply as jest.Mock).mock.calls[0][0] as string;
        // 18:00 UTC = 13:00 EST (hour12: false → 24h format)
        expect(replyArg).toContain('13:00');
    });
});
