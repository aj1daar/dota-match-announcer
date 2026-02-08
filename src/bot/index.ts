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

let bot: Telegraf<CustomContext> | null = null;

function getBot(token: string, env?: Env): Telegraf<CustomContext> {
    if (!bot) {
        bot = new Telegraf<CustomContext>(token);

        // Register middleware to attach env to context
        if (env) {
            bot.use(async (ctx, next) => {
                (ctx as CustomContext).env = env;
                await next();
            });
        }

        // Register error handler
        bot.catch((err, ctx) => {
            console.error('Telegraf error:', err);
            try {
                ctx.reply('An error occurred. Please try again later.').catch((e) => {
                    console.error('Failed to send error message:', e);
                });
            } catch (e) {
                console.error('Failed to send error message:', e);
            }
        });

        // Register commands
        bot.start(startCommand);
        bot.command('searchteam', searchTeamCommand);
        bot.command('myteams', myTeamsCommand);

        // Register callback query handler
        bot.on('callback_query', (ctx: CustomContext) => {
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
    return bot;
}

export const handleUpdate = async (request: Request, env: Env): Promise<Response> => {
    try {
        const bot = getBot(env.TELEGRAM_BOT_TOKEN, env);

        // Parse the update
        const update = (await request.json()) as Update;
        console.log('Received Telegram update:', JSON.stringify(update, null, 2));

        /*
         * Manually process the update since we can't use Express middleware
         * Create a minimal context-like object that satisfies the response interface
         */
        await bot.handleUpdate(update, {
            writableEnded: false,
            end: () => {
                // No-op: response handling is handled by Telegram's webhook mechanism
            },
        } as any);

        return new Response('OK', { status: 200 });
    } catch (error) {
        console.error('Error handling Telegram update:', error);
        console.error('Stack:', (error as Error).stack);
        return new Response(JSON.stringify({ error: String(error) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
