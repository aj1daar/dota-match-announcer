import {AutoRouter} from 'itty-router';
import {handleUpdate} from './bot';
import {handleCron} from './cron';

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  PANDASCORE_TOKEN: string;
  D1: D1Database;
  NOTIFICATIONS_KV: KVNamespace;
}

// Secret webhook path to bypass Telegram filters on workers.dev domains
const SECRET_WEBHOOK_PATH = '/webhook-e7a3f9b2c1d4e6a8k2p5m8n9x3y7z0q4';

const router = AutoRouter();

// Helper function to register webhook with Telegram
async function registerWebhook(env: Env, webhookUrl: string): Promise<boolean> {
    try {
        console.log('Attempting to register webhook:', webhookUrl);
        const response = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/setWebhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: webhookUrl,
                drop_pending_updates: false,
                allowed_updates: ['message', 'callback_query', 'my_chat_member'],
                secret_token: 'webhook_secret_token_12345',
            }),
        });

        const responseText = await response.text();
        const result = JSON.parse(responseText) as { ok: boolean; description?: string };

        if (result.ok) {
            console.log('Webhook registered successfully:', webhookUrl);
            return true;
        } else {
            console.error('Failed to register webhook:', result.description);
            return false;
        }
    } catch (error) {
        console.error('Error registering webhook:', error);
        return false;
    }
}

// Health check endpoint with auto webhook registration
router.get('/', async (request: Request, env: Env) => {
    // Try to register webhook if not already done
    const webhookRegistered = await env.NOTIFICATIONS_KV.get('webhook_registered');

    if (!webhookRegistered) {
        const url = new URL(request.url);
        /*
         * Force HTTPS for webhook URL (required by Telegram)
         * This handles both localhost and ngrok tunnel cases
         */
        const origin = url.origin.replace('http://', 'https://');
        const webhookUrl = `${origin}${SECRET_WEBHOOK_PATH}`;
        const success = await registerWebhook(env, webhookUrl);
        if (success) {
            await env.NOTIFICATIONS_KV.put('webhook_registered', 'true', { expirationTtl: 86400 * 30 });
        }
    }

    return new Response('Dota Match Announcer Bot is running!', {
        headers: { 'Content-Type': 'text/plain' },
    });
});

// Debug endpoint to check webhook status
router.get('/webhook-info', async (request: Request, env: Env) => {
    try {
        const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
        const data = await response.json();
        return new Response(JSON.stringify(data, null, 2), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: String(error) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});

// Debug endpoint to check bot status
router.get('/bot-info', async (request: Request, env: Env) => {
    try {
        const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
        const data = await response.json();
        return new Response(JSON.stringify(data, null, 2), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: String(error) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});

// Telegram webhook setup endpoint
router.get('/setup-webhook', async (request: Request, env: Env) => {
    try {
        const url = new URL(request.url);
        let webhookUrl = url.searchParams.get('webhook_url');

        if (!webhookUrl) {
            // If no webhook_url provided, construct it with the secret path
            const workerUrl = url.origin;
            webhookUrl = `${workerUrl}${SECRET_WEBHOOK_PATH}`;
        }

        console.log('Setting webhook to:', webhookUrl);

        const response = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/setWebhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: webhookUrl,
                drop_pending_updates: false,
                allowed_updates: ['message', 'callback_query', 'my_chat_member'],
                secret_token: 'webhook_secret_token_12345',
            }),
        });

        const responseText = await response.text();
        console.log('Telegram response status:', response.status);
        console.log('Telegram response text:', responseText);

        let result;
        try {
            result = JSON.parse(responseText) as { ok: boolean; description?: string; error_code?: number };
        } catch (e) {
            return new Response(`Failed to parse Telegram response: ${responseText}`, { status: 500 });
        }

        if (result.ok) {
            return new Response(`Webhook set successfully to: ${webhookUrl}`, { status: 200 });
        } else {
            return new Response(`Failed to set webhook: ${result.description} (error code: ${result.error_code})`, { status: 400 });
        }

    } catch (error) {
        console.error('Error setting webhook:', error);
        return new Response('Error setting webhook: ' + String(error), { status: 500 });
    }
});

// Telegram polling endpoint - long polling with 25 second timeout
router.get('/poll-updates', async (request: Request, env: Env) => {
    try {
        const lastUpdateId = await env.NOTIFICATIONS_KV.get('last_telegram_update_id');
        const offset = lastUpdateId ? parseInt(lastUpdateId) + 1 : 0;

        // Use long polling with 25 second timeout (Cloudflare limit is 30 seconds)
        const response = await fetch(
            `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset}&timeout=25`
        );
        const data = (await response.json()) as { ok: boolean; result: any[] };

        if (!data.ok) {
            return new Response(JSON.stringify({ error: 'Failed to fetch updates' }), { status: 400 });
        }

        for (const update of data.result) {
            try {
                // Create a fake Request object for handleUpdate
                const fakeRequest = new Request('https://example.com', {
                    method: 'POST',
                    body: JSON.stringify(update),
                });
                await handleUpdate(fakeRequest, env);
                // Update the last processed update ID
                await env.NOTIFICATIONS_KV.put('last_telegram_update_id', String(update.update_id));
            } catch (error) {
                console.error('Error processing update:', error);
            }
        }

        return new Response(JSON.stringify({ ok: true, processed: data.result.length }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Error polling updates:', error);
        return new Response(JSON.stringify({ ok: false, error: String(error) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});

// Telegram webhook endpoint (using secret path to bypass Telegram filters)
router.post(SECRET_WEBHOOK_PATH, async (request: Request, env: Env) => {
    try {
        return await handleUpdate(request, env);
    } catch (error) {
        console.error('Error handling update:', error);
        return new Response(JSON.stringify({ ok: false, error: String(error) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});

// Keep old endpoint for backward compatibility
router.post('/telegram-webhook', async (request: Request, env: Env) => {
    try {
        return await handleUpdate(request, env);
    } catch (error) {
        console.error('Error handling update:', error);
        return new Response(JSON.stringify({ ok: false, error: String(error) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});

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
