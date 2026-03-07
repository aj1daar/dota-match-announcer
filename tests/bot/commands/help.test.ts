import { helpCommand } from '../../../src/bot/commands/help';
import { CustomContext } from '../../../src/bot/context';

describe('helpCommand', () => {
    let mockCtx: Partial<CustomContext>;

    beforeEach(() => {
        mockCtx = {
            reply: jest.fn(),
        } as Partial<CustomContext>;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should send help message with all available commands', async () => {
        await helpCommand(mockCtx as CustomContext);

        expect(mockCtx.reply).toHaveBeenCalledTimes(1);
        const [message, options] = (mockCtx.reply as jest.Mock).mock.calls[0];

        expect(message).toContain('Dota Match Announcer Bot - Help');
        expect(message).toContain('/start');
        expect(message).toContain('/help');
        expect(message).toContain('/searchteam');
        expect(message).toContain('/myteams');
        expect(message).toContain('/timezone');
        expect(message).toContain('How it works:');
        expect(options).toEqual({ parse_mode: 'HTML' });
    });

    it('should handle errors gracefully', async () => {
        mockCtx.reply = jest.fn().mockRejectedValue(new Error('Network error'));

        /*
         * When reply fails, the function catches the error internally
         * and tries to send an error message (which also fails)
         * but doesn't propagate the rejection
         */
        await helpCommand(mockCtx as CustomContext);

        // Reply should be called twice: once for the help text, once for error message
        expect(mockCtx.reply).toHaveBeenCalledTimes(2);
    });
});
