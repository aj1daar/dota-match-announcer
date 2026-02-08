import { Env } from '../index';

export interface Subscriber {
  id: number;
  telegramId: number;
  createdAt: string;
}

export interface TeamSubscription {
  id: number;
  subscriberId: number;
  teamId: number;
  teamName: string;
  createdAt: string;
}

export const getDb = (env: Env) => {
    return {
        async createSubscriber(telegramId: number): Promise<Subscriber> {
            const { results } = await env.D1.prepare(
                'INSERT INTO Subscribers (telegramId) VALUES (?) RETURNING *',
            )
                .bind(telegramId)
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
    };
};
