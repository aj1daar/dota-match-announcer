import { Env } from '../index';
import { getDb } from '../db/utils';

const LEGACY_BACKFILL_TTL_SECONDS = 2592000;

/*
 * Remembers which notifications have already gone out, so each is sent once.
 *
 * The record lives in D1 because claiming a key there is a single atomic
 * statement: when two cron runs overlap (one running long into the next
 * minute), only one of them wins the claim and sends. With KV the check and the
 * write were separate steps, so both runs could pass the check and both send.
 *
 * Everything still unexpired is loaded once per run, which keeps the per-match
 * "already sent?" checks in memory instead of one query each.
 */
export class NotificationLog {
    private constructor(
        private readonly env: Env,
        private readonly db: ReturnType<typeof getDb>,
        private readonly known: Map<string, string | null>,
    ) {}

    static async load(env: Env): Promise<NotificationLog> {
        const db = getDb(env);
        try {
            await db.deleteExpiredNotifications();
        } catch (e) {
            // Housekeeping only; stale rows are ignored by expiry anyway.
            console.error('[notifications] Failed to delete expired entries:', e);
        }
        const active = await db.getActiveNotifications();
        return new NotificationLog(env, db, new Map(active.map(n => [n.key, n.value])));
    }

    async has(key: string): Promise<boolean> {
        if (this.known.has(key)) return true;

        /*
         * Notifications sent before the move to D1 are only recorded in KV.
         * Honor those, and copy each one over on first sight, so the switch
         * does not re-announce everything. Nothing writes these KV keys any
         * more and the longest-lived ones expire after 30 days, at which point
         * this fallback can be deleted.
         */
        if (await this.env.NOTIFICATIONS_KV.get(key)) {
            await this.db.claimNotification(key, LEGACY_BACKFILL_TTL_SECONDS);
            this.known.set(key, null);
            return true;
        }

        return false;
    }

    // The value stored alongside a key, if any (e.g. the start time a match was announced with).
    value(key: string): string | null {
        return this.known.get(key) ?? null;
    }

    /*
     * Resolves true if the caller is the one that gets to send this
     * notification. Always claim *before* sending: a run that dies half-way
     * then costs at most one missed notification, rather than re-sending to
     * everyone a minute later.
     */
    async claim(key: string, ttlSeconds: number, value?: string): Promise<boolean> {
        if (await this.has(key)) return false;

        const claimed = value === undefined
            ? await this.db.claimNotification(key, ttlSeconds)
            : await this.db.claimNotification(key, ttlSeconds, value);
        // Win or lose, the key is taken now.
        this.known.set(key, value ?? null);
        return claimed;
    }

    /*
     * Replaces the value stored with a key, but only if nobody else changed it
     * since this run loaded it. Resolves true for the one caller that made the
     * change, which makes "the value moved from A to B" a once-only event too.
     */
    async updateValue(key: string, value: string): Promise<boolean> {
        const updated = await this.db.updateNotificationValue(key, this.value(key), value);
        this.known.set(key, value);
        return updated;
    }

    // Forgets a notification so it can be sent again.
    async release(key: string): Promise<void> {
        await this.db.releaseNotification(key);
        this.known.delete(key);
    }
}
