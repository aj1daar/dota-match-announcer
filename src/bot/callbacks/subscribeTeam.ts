import { CustomContext } from '../context';
import { getDb } from '../../db/utils';
import { isDataCallbackQuery } from '../utils';
import { escapeHtml } from '../../utils/html';

export const subscribeTeamCallback = async (ctx: CustomContext) => {
    if (!ctx.callbackQuery || !isDataCallbackQuery(ctx.callbackQuery)) {
        console.error('Invalid callback query:', ctx.callbackQuery);
        return ctx.answerCbQuery('Something went wrong: No callback data.');
    }

    const callbackData = ctx.callbackQuery.data;
    const parts = callbackData.split(':');
    if (parts.length < 3 || parts[0] !== 'subscribe_team') {
        console.error('Invalid callback data format:', callbackData);
        return ctx.answerCbQuery('Invalid callback data.');
    }

    const teamId = parseInt(parts[1], 10);
    const teamName = parts.slice(2).join(':');
    const telegramId = ctx.from?.id;

    if (!telegramId || isNaN(teamId)) {
        console.error('No Telegram ID found in context, or invalid team ID');
        return ctx.answerCbQuery('Could not identify your Telegram ID.');
    }

    console.log(`Attempting to subscribe user ${telegramId} to team ${teamId} (${teamName})`);

    const db = getDb(ctx.env);
    const subscriber = await db.getSubscriberByTelegramId(telegramId);

    if (!subscriber) {
        console.warn(`No subscriber found for Telegram ID ${telegramId}. User needs to run /start first.`);
        return ctx.answerCbQuery('You need to /start the bot first.');
    }

    console.log(`Found subscriber: ${subscriber.id} for Telegram ID ${telegramId}`);

    try {
        const subscription = await db.subscribeTeam(subscriber.id, teamId, teamName);
        console.log(`Successfully subscribed user ${subscriber.id} to team ${teamId}:`, subscription);
        await ctx.answerCbQuery(`Subscribed to ${teamName}!`);
        await ctx.editMessageText(`You are now subscribed to ${teamName}.`).catch((e) => {
            console.error('[subscribe] editMessageText failed, falling back to reply:', e);
            return ctx.reply(`You are now subscribed to <b>${escapeHtml(teamName)}</b>!`, { parse_mode: 'HTML' }).catch(console.error);
        });
    } catch (error: any) {
        console.error('Error subscribing to team:', error);
        if (error.message && error.message.includes('UNIQUE constraint failed')) {
            console.log(`User ${subscriber.id} is already subscribed to team ${teamId}`);
            await ctx.answerCbQuery(`You are already subscribed to ${teamName}.`);
            return;
        }
        console.error('Failed to subscribe - unexpected error:', error.message || String(error));
        await ctx.answerCbQuery('Failed to subscribe to team.');
    }
};
