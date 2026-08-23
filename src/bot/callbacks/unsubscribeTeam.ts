import { CustomContext } from '../context';
import { getDb } from '../../db/utils';
import { isDataCallbackQuery } from '../utils';
import { escapeHtml } from '../../utils/html';

export const unsubscribeTeamCallback = async (ctx: CustomContext) => {
    if (!ctx.callbackQuery || !isDataCallbackQuery(ctx.callbackQuery)) {
        return ctx.answerCbQuery('Something went wrong: No callback data.');
    }

    const callbackData = ctx.callbackQuery.data;
    const parts = callbackData.split(':');
    if (parts.length < 2 || parts[0] !== 'unsubscribe_team') {
        return ctx.answerCbQuery('Invalid callback data.');
    }

    const teamId = parseInt(parts[1], 10);
    const telegramId = ctx.from?.id;

    if (!telegramId || isNaN(teamId)) {
        return ctx.answerCbQuery('Could not identify your Telegram ID.');
    }

    const db = getDb(ctx.env);
    const subscriber = await db.getSubscriberByTelegramId(telegramId);

    if (!subscriber) {
        return ctx.answerCbQuery('You are not a subscriber.');
    }

    const subscriptions = await db.getSubscriptionsBySubscriberId(subscriber.id);
    const teamName = subscriptions.find((s) => s.teamId === teamId)?.teamName || `Team ${teamId}`;

    try {
        await db.unsubscribeTeam(subscriber.id, teamId);
        await ctx.answerCbQuery(`Unsubscribed from ${teamName}.`);
        await ctx.editMessageText(
            `You have successfully unsubscribed from ${teamName}.`,
        ).catch((e) => {
            console.error('[unsubscribe] editMessageText failed, falling back to reply:', e);
            return ctx.reply(`Unsubscribed from <b>${escapeHtml(teamName)}</b>.`, { parse_mode: 'HTML' }).catch(console.error);
        });
    } catch (error) {
        console.error('Error unsubscribing from team:', error);
        await ctx.answerCbQuery('Failed to unsubscribe from team.');
    }
};
