import worker, { Env } from '../src';
import { handleUpdate } from '../src/bot';
import { handleCron } from '../src/cron';
import {
    deriveWebhookSecret,
    timingSafeEqual,
    TELEGRAM_SECRET_HEADER,
} from '../src/utils/webhookAuth';

jest.mock('../src/bot');
jest.mock('../src/cron');

const BOT_TOKEN = '123456:test-bot-token';
const ADMIN_TOKEN = 'correct-admin-token';
const WEBHOOK_PATH = '/webhook-e7a3f9b2c1d4e6a8k2p5m8n9x3y7z0q4';
const ORIGIN = 'https://bot.example.workers.dev';
const ADMIN_ROUTES = ['/setup-webhook', '/webhook-info', '/bot-info', '/poll-updates'];

describe('worker entry point', () => {
    let kvStore: Map<string, string>;
    let env: Env;

    const send = (path: string, init?: RequestInit): Promise<Response> =>
        (worker as any).fetch(new Request(`${ORIGIN}${path}`, init), env);
    const asAdmin = (token = ADMIN_TOKEN): RequestInit => ({ headers: { Authorization: `Bearer ${token}` } });
    const telegramCalls = (method: string) =>
        fetchMock.mock.calls.filter(call => String(call[0]).endsWith(`/${method}`));
    const setWebhookBody = () => JSON.parse(telegramCalls('setWebhook')[0][1]?.body as string);

    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        fetchMock.resetMocks();
        fetchMock.mockResponse(JSON.stringify({ ok: true, result: [] }));

        kvStore = new Map<string, string>();
        env = {
            TELEGRAM_BOT_TOKEN: BOT_TOKEN,
            NOTIFICATIONS_KV: {
                get: jest.fn(async (key: string) => kvStore.get(key) ?? null),
                put: jest.fn(async (key: string, value: string) => {
                    kvStore.set(key, value);
                }),
            } as unknown as KVNamespace,
        } as Env;

        (handleUpdate as jest.Mock).mockResolvedValue(new Response('OK', { status: 200 }));
        (handleCron as jest.Mock).mockResolvedValue(undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    describe('admin endpoints', () => {
        it.each(ADMIN_ROUTES)('should hide %s when no ADMIN_TOKEN is configured', async (route) => {
            const anonymous = await send(route);
            const guessing = await send(route, asAdmin('undefined'));

            expect(anonymous.status).toBe(404);
            expect(guessing.status).toBe(404);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it.each(ADMIN_ROUTES)('should hide %s from callers without the right token', async (route) => {
            env.ADMIN_TOKEN = ADMIN_TOKEN;

            const responses = await Promise.all([
                send(route),
                send(route, asAdmin('wrong-admin-token')),
                send(route, { headers: { Authorization: ADMIN_TOKEN } }),
                send(`${route}?token=${ADMIN_TOKEN}`),
            ]);

            expect(responses.map(r => r.status)).toEqual([404, 404, 404, 404]);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('should not let an anonymous caller re-point the webhook at their own server', async () => {
            env.ADMIN_TOKEN = ADMIN_TOKEN;

            const response = await send('/setup-webhook?webhook_url=https://evil.example/steal');

            expect(response.status).toBe(404);
            expect(telegramCalls('setWebhook')).toHaveLength(0);
        });

        it('should set the webhook for an authorized admin, using the derived secret', async () => {
            env.ADMIN_TOKEN = ADMIN_TOKEN;

            const response = await send('/setup-webhook', asAdmin());

            expect(response.status).toBe(200);
            expect(setWebhookBody()).toMatchObject({
                url: `${ORIGIN}${WEBHOOK_PATH}`,
                secret_token: await deriveWebhookSecret(BOT_TOKEN),
            });
        });

        it('should process pending updates for an authorized admin', async () => {
            env.ADMIN_TOKEN = ADMIN_TOKEN;
            fetchMock.mockResponse(JSON.stringify({ ok: true, result: [{ update_id: 7 }] }));

            const response = await send('/poll-updates', asAdmin());

            expect(response.status).toBe(200);
            expect(handleUpdate).toHaveBeenCalledTimes(1);
            expect(kvStore.get('last_telegram_update_id')).toBe('7');
        });
    });

    describe('telegram webhook', () => {
        const post = (path: string, secret?: string) =>
            send(path, {
                method: 'POST',
                body: JSON.stringify({ update_id: 1 }),
                headers: secret ? { [TELEGRAM_SECRET_HEADER]: secret } : {},
            });

        it.each([WEBHOOK_PATH, '/telegram-webhook'])('should reject a forged update on %s', async (path) => {
            const responses = await Promise.all([
                post(path),
                post(path, 'webhook_secret_token_12345'),
                post(path, BOT_TOKEN),
            ]);

            expect(responses.map(r => r.status)).toEqual([403, 403, 403]);
            expect(handleUpdate).not.toHaveBeenCalled();
        });

        it.each([WEBHOOK_PATH, '/telegram-webhook'])('should accept an update carrying the registered secret on %s', async (path) => {
            const response = await post(path, await deriveWebhookSecret(BOT_TOKEN));

            expect(response.status).toBe(200);
            expect(handleUpdate).toHaveBeenCalledTimes(1);
        });

        it('should register the webhook from the health check with the derived secret, not a hardcoded one', async () => {
            await send('/');

            const body = setWebhookBody();
            expect(body.url).toBe(`${ORIGIN}${WEBHOOK_PATH}`);
            expect(body.secret_token).toBe(await deriveWebhookSecret(BOT_TOKEN));
            expect(body.secret_token).not.toBe('webhook_secret_token_12345');
        });
    });

    describe('scheduled', () => {
        const runScheduled = () => (worker as any).scheduled({ cron: '*/1 * * * *' }, env);
        const webhookInfo = (url: string) => JSON.stringify({ ok: true, result: { url } });

        it('should re-register the existing webhook URL with the derived secret, once', async () => {
            fetchMock.mockResponse(async (req) =>
                req.url.endsWith('/getWebhookInfo') ? webhookInfo(`${ORIGIN}${WEBHOOK_PATH}`) : JSON.stringify({ ok: true }),
            );

            await runScheduled();
            await runScheduled();

            expect(telegramCalls('setWebhook')).toHaveLength(1);
            expect(setWebhookBody()).toMatchObject({
                url: `${ORIGIN}${WEBHOOK_PATH}`,
                secret_token: await deriveWebhookSecret(BOT_TOKEN),
            });
            expect(handleCron).toHaveBeenCalledTimes(2);
        });

        it('should re-register again after the bot token changes', async () => {
            fetchMock.mockResponse(async (req) =>
                req.url.endsWith('/getWebhookInfo') ? webhookInfo(`${ORIGIN}${WEBHOOK_PATH}`) : JSON.stringify({ ok: true }),
            );

            await runScheduled();
            env.TELEGRAM_BOT_TOKEN = '654321:rotated-token';
            await runScheduled();

            expect(telegramCalls('setWebhook')).toHaveLength(2);
        });

        it('should not register anything when no webhook is set', async () => {
            fetchMock.mockResponse(webhookInfo(''));

            await runScheduled();

            expect(telegramCalls('setWebhook')).toHaveLength(0);
            expect(handleCron).toHaveBeenCalledTimes(1);
        });

        it('should still run the cron, and try again next time, when Telegram is unreachable', async () => {
            fetchMock.mockReject(new Error('network down'));

            await runScheduled();
            await runScheduled();

            expect(handleCron).toHaveBeenCalledTimes(2);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('should not store the webhook secret itself in KV', async () => {
            fetchMock.mockResponse(async (req) =>
                req.url.endsWith('/getWebhookInfo') ? webhookInfo(`${ORIGIN}${WEBHOOK_PATH}`) : JSON.stringify({ ok: true }),
            );

            await runScheduled();

            const secret = await deriveWebhookSecret(BOT_TOKEN);
            expect(Array.from(kvStore.values()).some(value => value.includes(secret))).toBe(false);
        });
    });

    describe('webhook secret helpers', () => {
        it('should derive a stable secret that Telegram accepts and that does not reveal the bot token', async () => {
            const secret = await deriveWebhookSecret(BOT_TOKEN);

            expect(secret).toMatch(/^[A-Za-z0-9_-]{1,256}$/);
            expect(secret).toBe(await deriveWebhookSecret(BOT_TOKEN));
            expect(secret).not.toBe(await deriveWebhookSecret('654321:other-token'));
            expect(secret).not.toContain('test-bot-token');
        });

        it('should compare strings exactly', () => {
            expect(timingSafeEqual('abc', 'abc')).toBe(true);
            expect(timingSafeEqual('abc', 'abd')).toBe(false);
            expect(timingSafeEqual('abc', 'abcabc')).toBe(false);
            expect(timingSafeEqual('abc', '')).toBe(false);
            expect(timingSafeEqual('', '')).toBe(true);
        });
    });
});
