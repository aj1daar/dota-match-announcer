import { CustomContext } from '../context';
import { getDb } from '../../db/utils';
import { detectTimezoneFromRequest } from '../../utils/timezone';

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
        const subscriber = await db.getSubscriberByTelegramId(telegramId);

        if (!subscriber) {
            const detectedTimezone = ctx.request
                ? detectTimezoneFromRequest(ctx.request)
                : 'UTC';

            await db.createSubscriber(telegramId, detectedTimezone);

            return ctx.reply(
                'Welcome to the Dota Match Announcer Bot! 🎮\n\n' +
                `You have been registered with timezone: *${detectedTimezone}*\n\n` +
                'You can change your timezone anytime with /timezone command.',
                { parse_mode: 'Markdown' }
            );
        } else {
            return ctx.reply(
                'Welcome back to the Dota Match Announcer Bot! 🎮\n\n' +
                `Your current timezone: *${subscriber.timezone}*\n` +
                'Change it with /timezone if needed.',
                { parse_mode: 'Markdown' }
            );
        }
    } catch (error) {
        console.error('Error in startCommand:', error);
        return ctx.reply('An error occurred while processing your request. Please try again.').catch(() => {
            console.error('Failed to send error message');
        });
    }
};
