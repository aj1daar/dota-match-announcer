import { CustomContext } from '../context';
import { getDb } from '../../db/utils';
import { TIMEZONE_REGIONS } from '../../utils/timezone';

export const timezoneCommand = async (ctx: CustomContext) => {
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
            return ctx.reply(
                'You need to start the bot first. Use /start to register.',
            );
        }

        const currentTz = subscriber.timezone || 'UTC';

        const keyboard = {
            inline_keyboard: TIMEZONE_REGIONS.map((region) => [
                {
                    text: region.name,
                    callback_data: `tz_region:${region.name}`,
                },
            ]),
        };

        await ctx.reply(
            '⏰ *Timezone Settings*\n\n' +
            `Your current timezone: *${currentTz}*\n\n` +
            'Select a region to change your timezone:',
            {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            }
        );
    } catch (error) {
        console.error('Error in timezoneCommand:', error);
        return ctx.reply('An error occurred while processing your request. Please try again.').catch(() => {
            console.error('Failed to send error message');
        });
    }
};
