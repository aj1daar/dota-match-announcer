import { myTeamsCommand } from '../../../src/bot/commands/myTeams';
import { getDb } from '../../../src/db/utils';
import { Env } from '../../../src';
import { CustomContext } from '../../../src/bot/context';

jest.mock('../../../src/db/utils');

describe('myTeamsCommand', () => {
    let mockCtx: Partial<CustomContext>;
    let mockEnv: Env;
    let mockDb: ReturnType<typeof getDb>;

    beforeEach(() => {
        mockEnv = {} as Env;
        mockCtx = {
            from: { id: 12345, is_bot: false, first_name: 'Test' },
            reply: jest.fn(),
            env: mockEnv,
        } as Partial<CustomContext>;

        mockDb = {
            getSubscriberByTelegramId: jest.fn(),
            getSubscriptionsBySubscriberId: jest.fn(),
        } as unknown as ReturnType<typeof getDb>;

        (getDb as jest.Mock).mockReturnValue(mockDb);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should inform the user if they are not subscribed to any teams', async () => {
        const subscriber = {
            id: 1,
            telegramId: 12345,
            createdAt: new Date().toISOString(),
        };
        (mockDb.getSubscriberByTelegramId as jest.Mock).mockResolvedValue(
            subscriber,
        );
        (mockDb.getSubscriptionsBySubscriberId as jest.Mock).mockResolvedValue([]);

        await myTeamsCommand(mockCtx as CustomContext);

        expect(mockCtx.reply).toHaveBeenCalledWith(
            'You are not subscribed to any teams yet. Use /searchteam to find teams to subscribe to.',
        );
    });

    it('should list subscribed teams with unsubscribe buttons', async () => {
        const subscriber = {
            id: 1,
            telegramId: 12345,
            createdAt: new Date().toISOString(),
        };
        const subscriptions = [
            {
                id: 1,
                subscriberId: 1,
                teamId: 10,
                teamName: 'Team Liquid',
                createdAt: new Date().toISOString(),
            },
            {
                id: 2,
                subscriberId: 1,
                teamId: 20,
                teamName: 'Team Secret',
                createdAt: new Date().toISOString(),
            },
        ];
        (mockDb.getSubscriberByTelegramId as jest.Mock).mockResolvedValue(
            subscriber,
        );
        (mockDb.getSubscriptionsBySubscriberId as jest.Mock).mockResolvedValue(
            subscriptions,
        );

        await myTeamsCommand(mockCtx as CustomContext);

        expect(mockCtx.reply).toHaveBeenCalledWith('Your subscribed teams:', {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: 'Unsubscribe from Team Liquid',
                            callback_data: 'unsubscribe_team:10:Team Liquid',
                        },
                    ],
                    [
                        {
                            text: 'Unsubscribe from Team Secret',
                            callback_data: 'unsubscribe_team:20:Team Secret',
                        },
                    ],
                ],
            },
        });
    });

    it('should inform the user if they are not a subscriber yet', async () => {
        (mockDb.getSubscriberByTelegramId as jest.Mock).mockResolvedValue(null);

        await myTeamsCommand(mockCtx as CustomContext);

        expect(mockCtx.reply).toHaveBeenCalledWith(
            'You are not subscribed to any teams yet. Use /searchteam to find teams to subscribe to.',
        );
    });
});
