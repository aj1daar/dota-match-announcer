import { startCommand } from '../../../src/bot/commands/start';
import { getDb } from '../../../src/db/utils';
import { Env } from '../../../src/index';
import { Context } from 'telegraf';

jest.mock('../../../src/db/utils');

describe('startCommand', () => {
    let mockCtx: Context;
    let mockEnv: Env;
    let mockDb: ReturnType<typeof getDb>;

    beforeEach(() => {
        mockCtx = {
            from: { id: 12345, is_bot: false, first_name: 'Test' },
            reply: jest.fn(),
        } as unknown as Context;

        mockDb = {
            getSubscriberByTelegramId: jest.fn(),
            createSubscriber: jest.fn(),
        } as unknown as ReturnType<typeof getDb>;

        (getDb as jest.Mock).mockReturnValue(mockDb);

        mockEnv = {} as Env;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should welcome back an existing subscriber', async () => {
        const subscriber = {
            id: 1,
            telegramId: 12345,
            createdAt: new Date().toISOString(),
        };
        (mockDb.getSubscriberByTelegramId as jest.Mock).mockResolvedValue(
            subscriber,
        );

        await startCommand(mockCtx, mockEnv);

        expect(mockDb.getSubscriberByTelegramId).toHaveBeenCalledWith(12345);
        expect(mockDb.createSubscriber).not.toHaveBeenCalled();
        expect(mockCtx.reply).toHaveBeenCalledWith(
            'Welcome back to the Dota Match Announcer Bot!',
        );
    });

    it('should register a new subscriber', async () => {
        (mockDb.getSubscriberByTelegramId as jest.Mock).mockResolvedValue(null);
        const newSubscriber = {
            id: 2,
            telegramId: 12345,
            createdAt: new Date().toISOString(),
        };
        (mockDb.createSubscriber as jest.Mock).mockResolvedValue(newSubscriber);

        await startCommand(mockCtx, mockEnv);

        expect(mockDb.getSubscriberByTelegramId).toHaveBeenCalledWith(12345);
        expect(mockDb.createSubscriber).toHaveBeenCalledWith(12345);
        expect(mockCtx.reply).toHaveBeenCalledWith(
            'Welcome to the Dota Match Announcer Bot! You have been registered.',
        );
    });

    it('should handle cases where telegramId is not available', async () => {
        mockCtx.from = undefined;

        await startCommand(mockCtx, mockEnv);

        expect(mockCtx.reply).toHaveBeenCalledWith(
            'Could not identify your Telegram ID.',
        );
        expect(mockDb.getSubscriberByTelegramId).not.toHaveBeenCalled();
    });
});
