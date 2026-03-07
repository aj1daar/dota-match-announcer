import { Telegraf } from 'telegraf';
import { Env } from '../index';
import { CustomContext } from './context';
import { startCommand } from './commands/start';
import { helpCommand } from './commands/help';
import { searchTeamCommand } from './commands/searchTeam';
import { myTeamsCommand } from './commands/myTeams';
import { timezoneCommand } from './commands/timezone';
import { subscribeTeamCallback } from './callbacks/subscribeTeam';
import { unsubscribeTeamCallback } from './callbacks/unsubscribeTeam';
import { timezoneRegionCallback, timezoneSetCallback, timezoneBackCallback } from './callbacks/timezone';
import { isDataCallbackQuery } from './utils';
import { performTeamSearch } from './utils/performTeamSearch';
import { Update } from 'telegraf/types';

let bot: Telegraf<CustomContext> | null = null;

function getBot(token: string, env?: Env, request?: Request): Telegraf<CustomContext> {
    if (!bot) {
        bot = new Telegraf<CustomContext>(token);

        if (env) {
            bot.use(async (ctx, next) => {
                (ctx as CustomContext).env = env;
                if (request) {
                    (ctx as CustomContext).request = request;
                }
                await next();
            });
        }

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

        bot.start(startCommand);
        bot.command('help', helpCommand);
        bot.command('searchteam', searchTeamCommand);
        bot.command('myteams', myTeamsCommand);
        bot.command('timezone', timezoneCommand);

        bot.hears('🔍 Search Teams', searchTeamCommand);
        bot.hears('📋 My Teams', myTeamsCommand);
        bot.hears('🕐 Timezone', timezoneCommand);
        bot.hears('❓ Help', helpCommand);

        bot.on('text', async (ctx: CustomContext) => {
            const text = (ctx.message as any)?.text;
            if (!text) {
                return;
            }
            if (text.startsWith('/')) {
                return;
            }
            const buttonTexts = ['🔍 Search Teams', '📋 My Teams', '🕐 Timezone', '❓ Help'];
            if (buttonTexts.includes(text)) {
                return;
            }

            console.log(`[text handler] User ${ctx.from?.id} searching for: "${text}"`);
            return performTeamSearch(ctx, text);
        });

        bot.on('callback_query', (ctx: CustomContext) => {
            if (!ctx.callbackQuery || !isDataCallbackQuery(ctx.callbackQuery)) {
                return ctx.answerCbQuery('Something went wrong: No callback data.');
            }
            const callbackData = ctx.callbackQuery.data;

            if (callbackData.startsWith('subscribe_team')) {
                return subscribeTeamCallback(ctx);
            } else if (callbackData.startsWith('unsubscribe_team')) {
                return unsubscribeTeamCallback(ctx);
            } else if (callbackData.startsWith('tz_region:')) {
                return timezoneRegionCallback(ctx);
            } else if (callbackData.startsWith('tz_set:')) {
                return timezoneSetCallback(ctx);
            } else if (callbackData === 'tz_back') {
                return timezoneBackCallback(ctx);
            }
        });
    }
    return bot;
}

export const handleUpdate = async (request: Request, env: Env): Promise<Response> => {
    try {
        const update = (await request.json()) as Update;
        console.log('Received Telegram update:', JSON.stringify(update, null, 2));

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const mockResponse: any = {
            writableEnded: false,
            statusCode: 200,
            statusMessage: 'OK',
            headers: {} as Record<string, string>,
            setHeader: (name: string, value: string) => {
                mockResponse.headers[name] = value;
                return mockResponse;
            },
            getHeader: (_name: string) => mockResponse.headers[_name],
            removeHeader: (_name: string) => {
                delete mockResponse.headers[_name];
                return mockResponse;
            },
            write: (_data: string | Buffer) => true,
            end: (_data?: string | Buffer) => {
                mockResponse.writableEnded = true;
            },
        };

        await getBot(env.TELEGRAM_BOT_TOKEN, env, request).handleUpdate(update, mockResponse);

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
