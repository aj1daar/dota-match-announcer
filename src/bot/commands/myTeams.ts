import { CustomContext } from '../context';
import { getDb } from '../../db/utils';
import { InlineKeyboardButton } from 'telegraf/types';

export const myTeamsCommand = async (ctx: CustomContext) => {
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

    const keyboardButtons: InlineKeyboardButton[][] = subscriptions.map((sub) => [
        {
            text: `Unsubscribe from ${sub.teamName}`,
            callback_data: `unsubscribe_team:${sub.teamId}:${sub.teamName}`,
        },
    ]);

    return ctx.reply('Your subscribed teams:', {
        reply_markup: {
            inline_keyboard: keyboardButtons,
        },
    });
};
