import { Env } from '../index';

export interface Subscriber {
  id: number;
  telegramId: number;
  timezone: string;
  createdAt: string;
}

export interface TeamSubscription {
  id: number;
  subscriberId: number;
  teamId: number;
  teamName: string;
  createdAt: string;
}

export interface SentNotification {
  key: string;
  value: string | null;
}

const nowInSeconds = () => Math.floor(Date.now() / 1000);

export const getDb = (env: Env) => {
    return {
        async createSubscriber(telegramId: number, timezone = 'UTC'): Promise<Subscriber> {
            const { results } = await env.D1.prepare(
                'INSERT INTO Subscribers (telegramId, timezone) VALUES (?, ?) RETURNING *',
            )
                .bind(telegramId, timezone)
                .all<Subscriber>();
            return results[0];
        },

        async getSubscriberByTelegramId(
            telegramId: number,
        ): Promise<Subscriber | null> {
            const { results } = await env.D1.prepare(
                'SELECT * FROM Subscribers WHERE telegramId = ?',
            )
                .bind(telegramId)
                .all<Subscriber>();
            return results.length ? results[0] : null;
        },

        async updateTimezone(telegramId: number, timezone: string): Promise<void> {
            await env.D1.prepare(
                'UPDATE Subscribers SET timezone = ? WHERE telegramId = ?',
            )
                .bind(timezone, telegramId)
                .run();
        },

        async subscribeTeam(
            subscriberId: number,
            teamId: number,
            teamName: string,
        ): Promise<TeamSubscription> {
            const { results } = await env.D1.prepare(
                'INSERT INTO TeamSubscriptions (subscriberId, teamId, teamName) VALUES (?, ?, ?) RETURNING *',
            )
                .bind(subscriberId, teamId, teamName)
                .all<TeamSubscription>();
            return results[0];
        },

        async getSubscriptionsBySubscriberId(
            subscriberId: number,
        ): Promise<TeamSubscription[]> {
            const { results } = await env.D1.prepare(
                'SELECT * FROM TeamSubscriptions WHERE subscriberId = ?',
            )
                .bind(subscriberId)
                .all<TeamSubscription>();
            return results;
        },

        async unsubscribeTeam(subscriberId: number, teamId: number): Promise<void> {
            await env.D1.prepare(
                'DELETE FROM TeamSubscriptions WHERE subscriberId = ? AND teamId = ?',
            )
                .bind(subscriberId, teamId)
                .run();
        },

        async getSubscribersByTeamId(teamId: number): Promise<Subscriber[]> {
            const { results } = await env.D1.prepare(
                'SELECT S.* FROM Subscribers S JOIN TeamSubscriptions TS ON S.id = TS.subscriberId WHERE TS.teamId = ?',
            )
                .bind(teamId)
                .all<Subscriber>();
            return results;
        },

        async getAllSubscriptions(): Promise<TeamSubscription[]> {
            const { results } = await env.D1.prepare(
                'SELECT * FROM TeamSubscriptions',
            ).all<TeamSubscription>();
            return results;
        },

        async getAllSubscribers(): Promise<Subscriber[]> {
            const { results } = await env.D1.prepare(
                'SELECT * FROM Subscribers',
            ).all<Subscriber>();
            return results;
        },

        async getActiveNotifications(): Promise<SentNotification[]> {
            const { results } = await env.D1.prepare(
                'SELECT key, value FROM SentNotifications WHERE expiresAt > ?',
            )
                .bind(nowInSeconds())
                .all<SentNotification>();
            return results;
        },

        /*
         * Atomically records a notification as sent. Resolves true for exactly
         * one caller per key (until it expires), no matter how many try at the
         * same time - the insert either creates the row or changes nothing.
         */
        async claimNotification(
            key: string,
            ttlSeconds: number,
            value: string | null = null,
        ): Promise<boolean> {
            const now = nowInSeconds();
            const result = await env.D1.prepare(
                'INSERT INTO SentNotifications (key, value, expiresAt) VALUES (?, ?, ?) ' +
                'ON CONFLICT(key) DO UPDATE SET value = excluded.value, expiresAt = excluded.expiresAt ' +
                'WHERE SentNotifications.expiresAt <= ?',
            )
                .bind(key, value, now + ttlSeconds, now)
                .run();
            return result.meta.changes === 1;
        },

        // Compare-and-swap: resolves true only for the caller that still saw expectedValue.
        async updateNotificationValue(
            key: string,
            expectedValue: string | null,
            value: string,
        ): Promise<boolean> {
            const result = await env.D1.prepare(
                'UPDATE SentNotifications SET value = ? WHERE key = ? AND value IS ?',
            )
                .bind(value, key, expectedValue)
                .run();
            return result.meta.changes === 1;
        },

        async releaseNotification(key: string): Promise<void> {
            await env.D1.prepare('DELETE FROM SentNotifications WHERE key = ?')
                .bind(key)
                .run();
        },

        async deleteExpiredNotifications(): Promise<void> {
            await env.D1.prepare('DELETE FROM SentNotifications WHERE expiresAt <= ?')
                .bind(nowInSeconds())
                .run();
        },
    };
};
