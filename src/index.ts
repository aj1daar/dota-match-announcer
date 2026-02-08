import { Router } from 'itty-router';
import { handleUpdate } from './bot';
import { handleCron } from './cron';

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  PANDASCORE_TOKEN: string;
  D1: D1Database;
  NOTIFICATIONS_KV: KVNamespace;
}

const router = Router();

router.post('/telegram-webhook', handleUpdate);

router.all('*', () => new Response('404, not found!', { status: 404 }));

export default {
    async fetch(
        request: Request,
        env: Env,
        ctx: ExecutionContext,
    ): Promise<Response> {
        return router.handle(request, env, ctx);
    },
    async scheduled(
        event: ScheduledEvent,
        env: Env,
        ctx: ExecutionContext,
    ): Promise<void> {
        await handleCron(env, ctx);
    },
};
