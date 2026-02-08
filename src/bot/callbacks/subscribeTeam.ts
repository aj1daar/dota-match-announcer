import { CustomContext } from '../context';
import { getDb } from '../../db/utils';
import { isDataCallbackQuery } from '../utils';

export const subscribeTeamCallback = async (ctx: CustomContext) => {
    if (!ctx.callbackQuery || !isDataCallbackQuery(ctx.callbackQuery)) {
        return ctx.answerCbQuery('Something went wrong: No callback data.');
    }

    const callbackData = ctx.callbackQuery.data;
    const parts = callbackData.split(':');
    if (parts.length !== 3 || parts[0] !== 'subscribe_team') {
        return ctx.answerCbQuery('Invalid callback data.');
    }

    const teamId = parseInt(parts[1], 10);
    const teamName = parts[2];
    const telegramId = ctx.from?.id;

    if (!telegramId) {
        return ctx.answerCbQuery('Could not identify your Telegram ID.');
    }

    const db = getDb(ctx.env);
    const subscriber = await db.getSubscriberByTelegramId(telegramId);

    if (!subscriber) {
        return ctx.answerCbQuery('You need to /start the bot first.');
    }

    try {
        await db.subscribeTeam(subscriber.id, teamId, teamName);
        await ctx.answerCbQuery(`Subscribed to ${teamName}!`);
        return ctx.editMessageText(`You are now subscribed to ${teamName}.`);
    } catch (error: any) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return ctx.answerCbQuery(`You are already subscribed to ${teamName}.`);
        }
        console.error('Error subscribing to team:', error);
        return ctx.answerCbQuery('Failed to subscribe to team.');
    }
};
