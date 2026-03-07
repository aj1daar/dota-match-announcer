import { CustomContext } from '../context';
import { getDb } from '../../db/utils';
import { TIMEZONE_REGIONS, isValidTimezone } from '../../utils/timezone';

export const timezoneRegionCallback = async (ctx: CustomContext) => {
    try {
        if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
            return ctx.answerCbQuery('Invalid callback data');
        }

        const data = ctx.callbackQuery.data;
        const regionName = data.replace('tz_region:', '');

        const region = TIMEZONE_REGIONS.find((r) => r.name === regionName);

        if (!region) {
            return ctx.answerCbQuery('Region not found');
        }

        const keyboard = {
            inline_keyboard: [
                ...region.timezones.map((tz) => [
                    {
                        text: tz.name,
                        callback_data: `tz_set:${tz.value}`,
                    },
                ]),
                [
                    {
                        text: '« Back to regions',
                        callback_data: 'tz_back',
                    },
                ],
            ],
        };

        await ctx.editMessageText(
            `⏰ *Select timezone in ${regionName}:*`,
            {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            }
        );

        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in timezoneRegionCallback:', error);
        await ctx.answerCbQuery('An error occurred').catch(() => undefined);
    }
};

export const timezoneSetCallback = async (ctx: CustomContext) => {
    try {
        if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
            return ctx.answerCbQuery('Invalid callback data');
        }

        const telegramId = ctx.from?.id;
        if (!telegramId) {
            return ctx.answerCbQuery('Could not identify your Telegram ID');
        }

        if (!ctx.env) {
            return ctx.answerCbQuery('Service configuration error');
        }

        const data = ctx.callbackQuery.data;
        const timezone = data.replace('tz_set:', '');

        if (!isValidTimezone(timezone)) {
            return ctx.answerCbQuery('Invalid timezone');
        }

        const db = getDb(ctx.env);
        await db.updateTimezone(telegramId, timezone);

        await ctx.editMessageText(
            '✅ *Timezone updated successfully!*\n\n' +
            `Your timezone is now set to: *${timezone}*\n\n` +
            'All match notifications will be displayed in your local time.',
            { parse_mode: 'Markdown' }
        );

        await ctx.answerCbQuery('Timezone updated!');
    } catch (error) {
        console.error('Error in timezoneSetCallback:', error);
        await ctx.answerCbQuery('An error occurred').catch(() => undefined);
    }
};

export const timezoneBackCallback = async (ctx: CustomContext) => {
    try {
        const telegramId = ctx.from?.id;

        if (!telegramId) {
            return ctx.answerCbQuery('Could not identify your Telegram ID');
        }

        if (!ctx.env) {
            return ctx.answerCbQuery('Service configuration error');
        }

        const db = getDb(ctx.env);
        const subscriber = await db.getSubscriberByTelegramId(telegramId);

        if (!subscriber) {
            return ctx.answerCbQuery('Subscriber not found');
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

        await ctx.editMessageText(
            '⏰ *Timezone Settings*\n\n' +
            `Your current timezone: *${currentTz}*\n\n` +
            'Select a region to change your timezone:',
            {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            }
        );

        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in timezoneBackCallback:', error);
        await ctx.answerCbQuery('An error occurred').catch(() => undefined);
    }
};
