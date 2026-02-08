import { CustomContext } from '../context';
import { getDb } from '../../db/utils';

export const startCommand = async (ctx: CustomContext) => {
    try {
        const telegramId = ctx.from?.id;

        if (!telegramId) {
            return ctx.reply('Could not identify your Telegram ID.');
        }

        if (!ctx.env) {
            console.error('Environment variables not available in context');
            return ctx.reply('Service configuration error. Please try again later.');
        }

        const db = getDb(ctx.env);
        let subscriber = await db.getSubscriberByTelegramId(telegramId);

        if (!subscriber) {
            subscriber = await db.createSubscriber(telegramId);
            return ctx.reply(
                'Welcome to the Dota Match Announcer Bot! You have been registered.',
            );
        } else {
            return ctx.reply('Welcome back to the Dota Match Announcer Bot!');
        }
    } catch (error) {
        console.error('Error in startCommand:', error);
        return ctx.reply('An error occurred while processing your request. Please try again.').catch(() => {
            console.error('Failed to send error message');
        });
    }
};
