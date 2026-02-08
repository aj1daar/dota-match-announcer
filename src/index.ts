import { AutoRouter } from 'itty-router';
import { handleUpdate } from './bot';
import { handleCron } from './cron';

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  PANDASCORE_TOKEN: string;
  D1: D1Database;
  NOTIFICATIONS_KV: KVNamespace;
}

const router = AutoRouter();

// Health check endpoint
router.get('/', () => 'Dota Match Announcer Bot is running!');

// Telegram webhook setup endpoint
router.get('/setup-webhook', async (request: Request, env: Env) => {
    try {
        const url = new URL(request.url);
        const webhookUrl = url.searchParams.get('webhook_url');

        if (!webhookUrl) {
            return new Response('Missing webhook_url parameter', { status: 400 });
        }

        const response = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/setWebhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: webhookUrl,
                drop_pending_updates: false,
            }),
        });

        const result = await response.json();

        if (result.ok) {
            return new Response(`Webhook set successfully to: ${webhookUrl}`, { status: 200 });
        } else {
            return new Response(`Failed to set webhook: ${result.description}`, { status: 400 });
        }
    } catch (error) {
        console.error('Error setting webhook:', error);
        return new Response('Error setting webhook: ' + String(error), { status: 500 });
    }
});

// Telegram webhook endpoint
router.post('/telegram-webhook', handleUpdate);

export default {
    ...router,
    async scheduled(
        event: ScheduledEvent,
        env: Env,
        ctx: ExecutionContext,
    ): Promise<void> {
        await handleCron(env, ctx);
    },
};
