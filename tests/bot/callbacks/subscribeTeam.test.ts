import { subscribeTeamCallback } from '../../../src/bot/callbacks/subscribeTeam';
import { getDb } from '../../../src/db/utils';
import { Env } from '../../../src';
import { CustomContext } from '../../../src/bot/context';

jest.mock('../../../src/db/utils');

describe('subscribeTeamCallback', () => {
    let mockCtx: Partial<CustomContext>;
    let mockEnv: Env;
    let mockDb: ReturnType<typeof getDb>;

    beforeEach(() => {
        mockEnv = {} as Env;
        mockCtx = {
            from: { id: 12345, is_bot: false, first_name: 'Test' },
            answerCbQuery: jest.fn(),
            editMessageText: jest.fn(),
            callbackQuery: { data: 'subscribe_team:10:Team Liquid' } as any,
            env: mockEnv,
        } as Partial<CustomContext>;

        mockDb = {
            getSubscriberByTelegramId: jest.fn(),
            subscribeTeam: jest.fn(),
        } as unknown as ReturnType<typeof getDb>;

        (getDb as jest.Mock).mockReturnValue(mockDb);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should subscribe a user to a team', async () => {
        const subscriber = {
            id: 1,
            telegramId: 12345,
            createdAt: new Date().toISOString(),
        };
        (mockDb.getSubscriberByTelegramId as jest.Mock).mockResolvedValue(
            subscriber,
        );

        await subscribeTeamCallback(mockCtx as CustomContext);

        expect(mockDb.subscribeTeam).toHaveBeenCalledWith(1, 10, 'Team Liquid');
        expect(mockCtx.answerCbQuery).toHaveBeenCalledWith(
            'Subscribed to Team Liquid!',
        );
        expect(mockCtx.editMessageText).toHaveBeenCalledWith(
            'You are now subscribed to Team Liquid.',
        );
    });

    it('should handle if user is not a subscriber', async () => {
        (mockDb.getSubscriberByTelegramId as jest.Mock).mockResolvedValue(null);
        await subscribeTeamCallback(mockCtx as CustomContext);
        expect(mockCtx.answerCbQuery).toHaveBeenCalledWith(
            'You need to /start the bot first.',
        );
    });

    it('should handle if user is already subscribed', async () => {
        const subscriber = {
            id: 1,
            telegramId: 12345,
            createdAt: new Date().toISOString(),
        };
        (mockDb.getSubscriberByTelegramId as jest.Mock).mockResolvedValue(
            subscriber,
        );
        (mockDb.subscribeTeam as jest.Mock).mockRejectedValue(
            new Error('UNIQUE constraint failed'),
        );

        await subscribeTeamCallback(mockCtx as CustomContext);

        expect(mockCtx.answerCbQuery).toHaveBeenCalledWith(
            'You are already subscribed to Team Liquid.',
        );
    });

    it('should handle invalid callback data', async () => {
        const invalidMockCtx = {
            ...mockCtx,
            callbackQuery: { data: 'invalid_data' } as any,
        } as CustomContext;
        await subscribeTeamCallback(invalidMockCtx);
        expect(invalidMockCtx.answerCbQuery).toHaveBeenCalledWith(
            'Invalid callback data.',
        );
    });
});
