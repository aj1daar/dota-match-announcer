import { CustomContext } from '../context';
import { getDb } from '../../db/utils';
import { InlineKeyboardButton } from 'telegraf/types';

export const myTeamsCommand = async (ctx: CustomContext) => {
    try {
        const telegramId = ctx.from?.id;

        if (!telegramId) {
            return ctx.reply('Could not identify your Telegram ID.');
        }

        const db = getDb(ctx.env);
        const subscriber = await db.getSubscriberByTelegramId(telegramId);

        if (!subscriber) {
            return ctx.reply(
                'You are not subscribed to any teams yet. Use /searchteam to find teams to subscribe to.',
            );
        }

        const subscriptions = await db.getSubscriptionsBySubscriberId(subscriber.id);

        if (subscriptions.length === 0) {
            return ctx.reply(
                'You are not subscribed to any teams yet. Use /searchteam to find teams to subscribe to.',
            );
        }

        const teamNames = subscriptions.map((sub) => `• ${sub.teamName}`).join('\n');
        const message = `Your subscribed teams:\n\n${teamNames}`;

        const keyboardButtons: InlineKeyboardButton[][] = subscriptions.map((sub) => [
            {
                text: '📅 Schedule',
                callback_data: `team_schedule:${sub.teamId}:${sub.teamName}`,
            },
            {
                text: `❌ ${sub.teamName}`,
                callback_data: `unsubscribe_team:${sub.teamId}:${sub.teamName}`,
            },
        ]);

        return ctx.reply(message, {
            reply_markup: {
                inline_keyboard: keyboardButtons,
            },
        });
    } catch (error) {
        console.error('Error in myTeamsCommand:', error);
        return ctx.reply('An error occurred while retrieving your teams. Please try again.').catch(() => {
            console.error('Failed to send error message');
        });
    }
};
