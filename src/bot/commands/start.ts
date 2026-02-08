import { CustomContext } from '../context';
import { getDb } from '../../db/utils';

export const startCommand = async (ctx: CustomContext) => {
    const telegramId = ctx.from?.id;

    if (!telegramId) {
        return ctx.reply('Could not identify your Telegram ID.');
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
};
