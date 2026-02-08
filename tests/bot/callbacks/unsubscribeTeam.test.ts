import { unsubscribeTeamCallback } from '../../../src/bot/callbacks/unsubscribeTeam';
import { getDb } from '../../../src/db/utils';
import { Env } from '../../../src';
import { CustomContext } from '../../../src/bot/context';

jest.mock('../../../src/db/utils');

describe('unsubscribeTeamCallback', () => {
    let mockCtx: Partial<CustomContext>;
    let mockEnv: Env;
    let mockDb: ReturnType<typeof getDb>;

    beforeEach(() => {
        mockEnv = {} as Env;
        mockCtx = {
            from: { id: 12345, is_bot: false, first_name: 'Test' },
            answerCbQuery: jest.fn(),
            editMessageText: jest.fn(),
            callbackQuery: { data: 'unsubscribe_team:10:Team Liquid' } as any,
            env: mockEnv,
        } as Partial<CustomContext>;

        mockDb = {
            getSubscriberByTelegramId: jest.fn(),
            unsubscribeTeam: jest.fn(),
        } as unknown as ReturnType<typeof getDb>;

        (getDb as jest.Mock).mockReturnValue(mockDb);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should unsubscribe a user from a team', async () => {
        const subscriber = {
            id: 1,
            telegramId: 12345,
            createdAt: new Date().toISOString(),
        };
        (mockDb.getSubscriberByTelegramId as jest.Mock).mockResolvedValue(
            subscriber,
        );

        await unsubscribeTeamCallback(mockCtx as CustomContext);

        expect(mockDb.unsubscribeTeam).toHaveBeenCalledWith(1, 10);
        expect(mockCtx.answerCbQuery).toHaveBeenCalledWith(
            'Unsubscribed from Team Liquid.',
        );
        expect(mockCtx.editMessageText).toHaveBeenCalledWith(
            'You have successfully unsubscribed from Team Liquid.',
        );
    });

    it('should handle if user is not a subscriber', async () => {
        (mockDb.getSubscriberByTelegramId as jest.Mock).mockResolvedValue(null);
        await unsubscribeTeamCallback(mockCtx as CustomContext);
        expect(mockCtx.answerCbQuery).toHaveBeenCalledWith(
            'You are not a subscriber.',
        );
    });

    it('should handle invalid callback data', async () => {
        const invalidMockCtx = {
            ...mockCtx,
            callbackQuery: { data: 'invalid_data' } as any,
        } as CustomContext;
        await unsubscribeTeamCallback(invalidMockCtx);
        expect(invalidMockCtx.answerCbQuery).toHaveBeenCalledWith(
            'Invalid callback data.',
        );
    });
});
