import {AutoRouter} from 'itty-router';
import {handleUpdate} from './bot';
import {handleCron} from './cron';
import {
    ensureWebhookSecret,
    isAdminRequest,
    isTelegramRequest,
    setTelegramWebhook,
} from './utils/webhookAuth';

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  PANDASCORE_TOKEN: string;
  // Optional. Enables the admin/debug endpoints, which stay disabled without it.
  ADMIN_TOKEN?: string;
  D1: D1Database;
  NOTIFICATIONS_KV: KVNamespace;
}

/*
 * Obscure webhook path to bypass Telegram filters on workers.dev domains. It is
 * NOT what protects the webhook (it is right here in the source): every webhook
 * call must also carry the secret token Telegram was given at registration.
 */
const WEBHOOK_PATH = '/webhook-e7a3f9b2c1d4e6a8k2p5m8n9x3y7z0q4';

const router = AutoRouter();

const notFound = () => new Response('Not Found', { status: 404 });

// Helper function to register webhook with Telegram
async function registerWebhook(env: Env, webhookUrl: string): Promise<boolean> {
    try {
        console.log('Attempting to register webhook:', webhookUrl);
        const result = await setTelegramWebhook(env, webhookUrl);

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
        const webhookUrl = `${origin}${WEBHOOK_PATH}`;
        const success = await registerWebhook(env, webhookUrl);
        if (success) {
            await env.NOTIFICATIONS_KV.put('webhook_registered', 'true', { expirationTtl: 86400 * 30 });
        }
    }

    return new Response('Dota Match Announcer Bot is running!', {
        headers: { 'Content-Type': 'text/plain' },
    });
});

/*
 * Everything below up to the webhook endpoints is admin-only: it exposes bot
 * details, re-points the webhook, or consumes pending updates. Unauthorized
 * callers get the same 404 as a route that does not exist.
 */

// Debug endpoint to check webhook status
router.get('/webhook-info', async (request: Request, env: Env) => {
    if (!isAdminRequest(request, env)) return notFound();
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
    if (!isAdminRequest(request, env)) return notFound();
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
    if (!isAdminRequest(request, env)) return notFound();
    try {
        const url = new URL(request.url);
        let webhookUrl = url.searchParams.get('webhook_url');

        if (!webhookUrl) {
            // If no webhook_url provided, construct it with the webhook path
            const workerUrl = url.origin;
            webhookUrl = `${workerUrl}${WEBHOOK_PATH}`;
        }

        console.log('Setting webhook to:', webhookUrl);

        const result = await setTelegramWebhook(env, webhookUrl);

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
    if (!isAdminRequest(request, env)) return notFound();
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

async function handleWebhook(request: Request, env: Env): Promise<Response> {
    // Without this check anyone who knows the URL could forge updates from any user.
    if (!(await isTelegramRequest(request, env))) {
        return new Response('Forbidden', { status: 403 });
    }

    try {
        return await handleUpdate(request, env);
    } catch (error) {
        console.error('Error handling update:', error);
        return new Response(JSON.stringify({ ok: false, error: String(error) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

// Telegram webhook endpoint
router.post(WEBHOOK_PATH, handleWebhook);

// Keep old endpoint for backward compatibility
router.post('/telegram-webhook', handleWebhook);

export default {
    ...router,
    async scheduled(
        event: ScheduledEvent,
        env: Env
    ): Promise<void> {
        try {
            await ensureWebhookSecret(env);
        } catch (error) {
            console.error('[webhook] Failed to verify webhook secret:', error);
        }

        await handleCron(env, event.cron);
    },
};
