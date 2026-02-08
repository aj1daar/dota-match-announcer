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
