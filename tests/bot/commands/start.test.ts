import { startCommand } from '../../../src/bot/commands/start';
import { getDb } from '../../../src/db/utils';
import { Env } from '../../../src';
import { CustomContext } from '../../../src/bot/context';

jest.mock('../../../src/db/utils');

describe('startCommand', () => {
    let mockCtx: CustomContext;
    let mockEnv: Env;
    let mockDb: ReturnType<typeof getDb>;

    beforeEach(() => {
        mockEnv = {} as Env;
        mockCtx = {
            from: { id: 12345, is_bot: false, first_name: 'Test' },
            reply: jest.fn(),
            env: mockEnv,
        } as unknown as CustomContext;

        mockDb = {
            getSubscriberByTelegramId: jest.fn(),
            createSubscriber: jest.fn(),
        } as unknown as ReturnType<typeof getDb>;

        (getDb as jest.Mock).mockReturnValue(mockDb);
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

        await startCommand(mockCtx);

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

        await startCommand(mockCtx);

        expect(mockDb.getSubscriberByTelegramId).toHaveBeenCalledWith(12345);
        expect(mockDb.createSubscriber).toHaveBeenCalledWith(12345);
        expect(mockCtx.reply).toHaveBeenCalledWith(
            'Welcome to the Dota Match Announcer Bot! You have been registered.',
        );
    });

    it('should handle cases where telegramId is not available', async () => {
        const mockCtxWithoutFrom: CustomContext = {
            reply: jest.fn(),
            env: mockEnv,
        } as unknown as CustomContext;

        await startCommand(mockCtxWithoutFrom);

        expect(mockCtxWithoutFrom.reply).toHaveBeenCalledWith(
            'Could not identify your Telegram ID.',
        );
        expect(mockDb.getSubscriberByTelegramId).not.toHaveBeenCalled();
    });
});
