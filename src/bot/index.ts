import { Telegraf } from 'telegraf';
import { Env } from '../index';
import { CustomContext } from './context';
import { startCommand } from './commands/start';
import { searchTeamCommand } from './commands/searchTeam';
import { myTeamsCommand } from './commands/myTeams';
import { subscribeTeamCallback } from './callbacks/subscribeTeam';
import { unsubscribeTeamCallback } from './callbacks/unsubscribeTeam';
import { isDataCallbackQuery } from './utils';
import { Update } from 'telegraf/types';

let bot: Telegraf<CustomContext>;

function initializeBot(token: string) {
    if (!bot) {
        bot = new Telegraf<CustomContext>(token);

        bot.start(startCommand);
        bot.command('searchteam', searchTeamCommand);
        bot.command('myteams', myTeamsCommand);

        bot.on('callback_query', (ctx: CustomContext) => {
            // Ensure it's a callback query with data using the type guard
            if (!ctx.callbackQuery || !isDataCallbackQuery(ctx.callbackQuery)) {
                return ctx.answerCbQuery('Something went wrong: No callback data.');
            }
            const callbackData = ctx.callbackQuery.data;

            if (callbackData.startsWith('subscribe_team')) {
                return subscribeTeamCallback(ctx);
            } else if (callbackData.startsWith('unsubscribe_team')) {
                return unsubscribeTeamCallback(ctx);
            }
        });
    }
}

export const handleUpdate = async (request: Request, env: Env) => {
    initializeBot(env.TELEGRAM_BOT_TOKEN);
    (bot.context as CustomContext).env = env;

    try {
        const update = (await request.json()) as Update;
        await bot.handleUpdate(update);
        return new Response('OK');
    } catch (error) {
        console.error('Error handling Telegram update:', error);
        return new Response('Error handling Telegram update', { status: 500 });
    }
};
