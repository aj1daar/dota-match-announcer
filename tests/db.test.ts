import {
    getDb,
    Subscriber,
    TeamSubscription } from '../src/db/utils';
import { Env } from '../src';

describe('D1 Database Utilities', () => {
    let mockEnv: Env;
    let mockD1: D1Database;
    let mockStatement: any;

    beforeEach(() => {
        mockStatement = {
            bind: jest.fn().mockReturnThis(),
            all: jest.fn(),
            run: jest.fn(),
        };

        mockD1 = {
            prepare: jest.fn(() => mockStatement),
        } as unknown as D1Database;

        mockEnv = {
            D1: mockD1,
        } as Env;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('createSubscriber', () => {
        it('should create a new subscriber', async () => {
            const mockSubscriber: Subscriber = {
                id: 1,
                telegramId: 12345,
                timezone: 'UTC',
                createdAt: new Date().toISOString(),
            };
            mockStatement.all.mockResolvedValue({
                results: [mockSubscriber],
            });
            const db = getDb(mockEnv);

            const result = await db.createSubscriber(12345);

            expect(mockD1.prepare).toHaveBeenCalledWith(
                'INSERT INTO Subscribers (telegramId, timezone) VALUES (?, ?) RETURNING *',
            );
            expect(mockStatement.bind).toHaveBeenCalledWith(12345, 'UTC');
            expect(mockStatement.all).toHaveBeenCalled();
            expect(result).toEqual(mockSubscriber);
        });
    });

    describe('getSubscriberByTelegramId', () => {
        it('should return a subscriber if one exists', async () => {
            const mockSubscriber: Subscriber = {
                id: 1,
                telegramId: 12345,
                timezone: 'UTC',
                createdAt: new Date().toISOString(),
            };
            mockStatement.all.mockResolvedValue({
                results: [mockSubscriber],
            });
            const db = getDb(mockEnv);

            const result = await db.getSubscriberByTelegramId(12345);

            expect(mockD1.prepare).toHaveBeenCalledWith(
                'SELECT * FROM Subscribers WHERE telegramId = ?',
            );
            expect(mockStatement.bind).toHaveBeenCalledWith(12345);
            expect(result).toEqual(mockSubscriber);
        });

        it('should return null if no subscriber exists', async () => {
            mockStatement.all.mockResolvedValue({ results: [] });
            const db = getDb(mockEnv);

            const result = await db.getSubscriberByTelegramId(12345);

            expect(result).toBeNull();
        });
    });

    describe('subscribeTeam', () => {
        it('should subscribe a user to a team', async () => {
            const mockSubscription: TeamSubscription = {
                id: 1,
                subscriberId: 1,
                teamId: 10,
                teamName: 'Team Liquid',
                createdAt: new Date().toISOString(),
            };
            mockStatement.all.mockResolvedValue({
                results: [mockSubscription],
            });
            const db = getDb(mockEnv);

            const result = await db.subscribeTeam(1, 10, 'Team Liquid');

            expect(mockD1.prepare).toHaveBeenCalledWith(
                'INSERT INTO TeamSubscriptions (subscriberId, teamId, teamName) VALUES (?, ?, ?) RETURNING *',
            );
            expect(mockStatement.bind).toHaveBeenCalledWith(1, 10, 'Team Liquid');
            expect(result).toEqual(mockSubscription);
        });
    });

    describe('getSubscriptionsBySubscriberId', () => {
        it('should return all subscriptions for a given subscriber', async () => {
            const mockSubscriptions: TeamSubscription[] = [
                {
                    id: 1,
                    subscriberId: 1,
                    teamId: 10,
                    teamName: 'Team Liquid',
                    createdAt: new Date().toISOString(),
                },
                {
                    id: 2,
                    subscriberId: 1,
                    teamId: 20,
                    teamName: 'Team Secret',
                    createdAt: new Date().toISOString(),
                },
            ];
            mockStatement.all.mockResolvedValue({
                results: mockSubscriptions,
            });
            const db = getDb(mockEnv);

            const result = await db.getSubscriptionsBySubscriberId(1);

            expect(mockD1.prepare).toHaveBeenCalledWith(
                'SELECT * FROM TeamSubscriptions WHERE subscriberId = ?',
            );
            expect(mockStatement.bind).toHaveBeenCalledWith(1);
            expect(result).toEqual(mockSubscriptions);
        });
    });

    describe('unsubscribeTeam', () => {
        it('should unsubscribe a user from a team', async () => {
            const db = getDb(mockEnv);

            await db.unsubscribeTeam(1, 10);

            expect(mockD1.prepare).toHaveBeenCalledWith(
                'DELETE FROM TeamSubscriptions WHERE subscriberId = ? AND teamId = ?',
            );
            expect(mockStatement.bind).toHaveBeenCalledWith(1, 10);
            expect(mockStatement.run).toHaveBeenCalled();
        });
    });

    describe('getSubscribersByTeamId', () => {
        it('should return all subscribers for a given team', async () => {
            const mockSubscribers: Subscriber[] = [
                { id: 1, telegramId: 12345, timezone: 'UTC', createdAt: new Date().toISOString() },
                { id: 2, telegramId: 54321, timezone: 'America/New_York', createdAt: new Date().toISOString() },
            ];
            mockStatement.all.mockResolvedValue({ results: mockSubscribers });
            const db = getDb(mockEnv);

            const result = await db.getSubscribersByTeamId(10);

            expect(mockD1.prepare).toHaveBeenCalledWith(
                'SELECT S.* FROM Subscribers S JOIN TeamSubscriptions TS ON S.id = TS.subscriberId WHERE TS.teamId = ?',
            );
            expect(mockStatement.bind).toHaveBeenCalledWith(10);
            expect(result).toEqual(mockSubscribers);
        });
    });

    describe('sent notifications', () => {
        const NOW_SECONDS = 1_700_000_000;

        beforeEach(() => {
            jest.spyOn(Date, 'now').mockReturnValue(NOW_SECONDS * 1000 + 999);
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('should claim with a single insert that leaves an unexpired row untouched', async () => {
            mockStatement.run.mockResolvedValue({ meta: { changes: 1 } });
            const db = getDb(mockEnv);

            const claimed = await db.claimNotification('match_final_1', 86400);

            const sql = (mockD1.prepare as jest.Mock).mock.calls[0][0] as string;
            expect(sql).toContain('INSERT INTO SentNotifications');
            expect(sql).toContain('ON CONFLICT(key) DO UPDATE');
            expect(sql).toContain('WHERE SentNotifications.expiresAt <= ?');
            expect(mockD1.prepare).toHaveBeenCalledTimes(1);
            expect(mockStatement.bind).toHaveBeenCalledWith('match_final_1', null, NOW_SECONDS + 86400, NOW_SECONDS);
            expect(claimed).toBe(true);
        });

        it('should report the claim as lost when the row already exists', async () => {
            mockStatement.run.mockResolvedValue({ meta: { changes: 0 } });
            const db = getDb(mockEnv);

            expect(await db.claimNotification('match_final_1', 86400)).toBe(false);
        });

        it('should store a value with the claim when given one', async () => {
            mockStatement.run.mockResolvedValue({ meta: { changes: 1 } });
            const db = getDb(mockEnv);

            await db.claimNotification('match_announced_known_1', 60, '2024-03-10T12:00:00Z');

            expect(mockStatement.bind).toHaveBeenCalledWith(
                'match_announced_known_1', '2024-03-10T12:00:00Z', NOW_SECONDS + 60, NOW_SECONDS,
            );
        });

        it('should only load notifications that have not expired', async () => {
            const active = [{ key: 'match_final_1', value: null }];
            mockStatement.all.mockResolvedValue({ results: active });
            const db = getDb(mockEnv);

            const result = await db.getActiveNotifications();

            expect(mockD1.prepare).toHaveBeenCalledWith('SELECT key, value FROM SentNotifications WHERE expiresAt > ?');
            expect(mockStatement.bind).toHaveBeenCalledWith(NOW_SECONDS);
            expect(result).toEqual(active);
        });

        it('should swap a value only when it still matches what the caller saw', async () => {
            mockStatement.run
                .mockResolvedValueOnce({ meta: { changes: 1 } })
                .mockResolvedValueOnce({ meta: { changes: 0 } });
            const db = getDb(mockEnv);

            const first = await db.updateNotificationValue('k', 'old', 'new');
            const second = await db.updateNotificationValue('k', 'old', 'newer');

            expect(mockD1.prepare).toHaveBeenCalledWith(
                'UPDATE SentNotifications SET value = ? WHERE key = ? AND value IS ?',
            );
            expect(mockStatement.bind).toHaveBeenCalledWith('new', 'k', 'old');
            expect([first, second]).toEqual([true, false]);
        });

        it('should release a notification and purge expired ones', async () => {
            mockStatement.run.mockResolvedValue({ meta: { changes: 1 } });
            const db = getDb(mockEnv);

            await db.releaseNotification('match_1');
            await db.deleteExpiredNotifications();

            expect(mockD1.prepare).toHaveBeenCalledWith('DELETE FROM SentNotifications WHERE key = ?');
            expect(mockStatement.bind).toHaveBeenCalledWith('match_1');
            expect(mockD1.prepare).toHaveBeenCalledWith('DELETE FROM SentNotifications WHERE expiresAt <= ?');
            expect(mockStatement.bind).toHaveBeenCalledWith(NOW_SECONDS);
        });
    });
});
