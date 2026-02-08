import { CustomContext } from '../context';
import { getDb } from '../../db/utils';
import { isDataCallbackQuery } from '../utils';

export const unsubscribeTeamCallback = async (ctx: CustomContext) => {
    if (!ctx.callbackQuery || !isDataCallbackQuery(ctx.callbackQuery)) {
        return ctx.answerCbQuery('Something went wrong: No callback data.');
    }

    const callbackData = ctx.callbackQuery.data;
    const parts = callbackData.split(':');
    if (parts.length !== 3 || parts[0] !== 'unsubscribe_team') {
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
        return ctx.answerCbQuery('You are not a subscriber.');
    }

    try {
        await db.unsubscribeTeam(subscriber.id, teamId);
        await ctx.answerCbQuery(`Unsubscribed from ${teamName}.`);
        return ctx.editMessageText(
            `You have successfully unsubscribed from ${teamName}.`,
        );
    } catch (error) {
        console.error('Error unsubscribing from team:', error);
        return ctx.answerCbQuery('Failed to unsubscribe from team.');
    }
};
