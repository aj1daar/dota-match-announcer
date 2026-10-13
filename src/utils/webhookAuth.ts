const TELEGRAM_API = 'https://api.telegram.org';
const WEBHOOK_SECRET_SYNCED_KEY = 'webhook_secret_synced';
const ALLOWED_UPDATES = ['message', 'callback_query', 'my_chat_member'];

export const TELEGRAM_SECRET_HEADER = 'X-Telegram-Bot-Api-Secret-Token';

interface WebhookEnv {
    TELEGRAM_BOT_TOKEN: string;
    ADMIN_TOKEN?: string;
    NOTIFICATIONS_KV: KVNamespace;
}

/*
 * The secret Telegram echoes back on every webhook call. It is derived from the
 * bot token instead of being its own setting, so it never appears in the source
 * and there is nothing extra to configure or keep in sync.
 */
export async function deriveWebhookSecret(botToken: string): Promise<string> {
    const data = new TextEncoder().encode(`telegram-webhook-secret:${botToken}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

// Compares without bailing out at the first difference, so response time does not leak how much of a guess matched.
export function timingSafeEqual(a: string, b: string): boolean {
    const left = new TextEncoder().encode(a);
    const right = new TextEncoder().encode(b);
    let diff = left.length ^ right.length;
    for (let i = 0; i < left.length; i++) {
        diff |= left[i] ^ right[i % (right.length || 1)];
    }
    return diff === 0;
}

// Only Telegram knows the secret the webhook was registered with, so anything else posting to the webhook is rejected.
export async function isTelegramRequest(request: Request, env: WebhookEnv): Promise<boolean> {
    const provided = request.headers.get(TELEGRAM_SECRET_HEADER);
    if (!provided || !env.TELEGRAM_BOT_TOKEN) return false;
    return timingSafeEqual(provided, await deriveWebhookSecret(env.TELEGRAM_BOT_TOKEN));
}

/*
 * Admin/debug endpoints are off unless an ADMIN_TOKEN secret is configured, and
 * then only answer to "Authorization: Bearer <ADMIN_TOKEN>". The token is taken
 * from a header rather than the URL because request URLs end up in logs.
 */
export function isAdminRequest(request: Request, env: WebhookEnv): boolean {
    if (!env.ADMIN_TOKEN) return false;
    const header = request.headers.get('Authorization') || '';
    if (!header.startsWith('Bearer ')) return false;
    return timingSafeEqual(header.slice('Bearer '.length), env.ADMIN_TOKEN);
}

export async function setTelegramWebhook(
    env: WebhookEnv,
    webhookUrl: string,
): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    const response = await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            url: webhookUrl,
            drop_pending_updates: false,
            allowed_updates: ALLOWED_UPDATES,
            secret_token: await deriveWebhookSecret(env.TELEGRAM_BOT_TOKEN),
        }),
    });
    return (await response.json()) as { ok: boolean; description?: string; error_code?: number };
}

/*
 * Makes sure the webhook Telegram currently has on file was registered with the
 * derived secret, re-registering the same URL if not. Run from the cron so a
 * deployment that changes the secret (or a rotated bot token) heals itself
 * within a minute instead of the bot silently rejecting every update.
 */
export async function ensureWebhookSecret(env: WebhookEnv): Promise<void> {
    const secret = await deriveWebhookSecret(env.TELEGRAM_BOT_TOKEN);
    // A fingerprint rather than the secret itself, so the secret is not readable from KV.
    const fingerprint = (await deriveWebhookSecret(secret)).slice(0, 16);
    if ((await env.NOTIFICATIONS_KV.get(WEBHOOK_SECRET_SYNCED_KEY)) === fingerprint) return;

    const infoResponse = await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
    const info = (await infoResponse.json()) as { ok: boolean; result?: { url?: string } };
    if (!info.ok) throw new Error('getWebhookInfo failed');

    const currentUrl = info.result?.url;
    if (!currentUrl) {
        // No webhook registered (e.g. local polling); look again later rather than every minute.
        await env.NOTIFICATIONS_KV.put(WEBHOOK_SECRET_SYNCED_KEY, fingerprint, { expirationTtl: 3600 });
        return;
    }

    const result = await setTelegramWebhook(env, currentUrl);
    if (!result.ok) throw new Error(`setWebhook failed: ${result.description}`);

    await env.NOTIFICATIONS_KV.put(WEBHOOK_SECRET_SYNCED_KEY, fingerprint);
    console.log('[webhook] Re-registered webhook with the current secret');
}
