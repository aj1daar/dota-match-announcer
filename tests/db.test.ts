import { getDb, Subscriber, TeamSubscription } from '../src/db/utils';
import { Env } from '../src/index';

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
                createdAt: new Date().toISOString(),
            };
            mockStatement.all.mockResolvedValue({
                results: [mockSubscriber],
            });
            const db = getDb(mockEnv);

            const result = await db.createSubscriber(12345);

            expect(mockD1.prepare).toHaveBeenCalledWith(
                'INSERT INTO Subscribers (telegramId) VALUES (?) RETURNING *',
            );
            expect(mockStatement.bind).toHaveBeenCalledWith(12345);
            expect(mockStatement.all).toHaveBeenCalled();
            expect(result).toEqual(mockSubscriber);
        });
    });

    describe('getSubscriberByTelegramId', () => {
        it('should return a subscriber if one exists', async () => {
            const mockSubscriber: Subscriber = {
                id: 1,
                telegramId: 12345,
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
                { id: 1, telegramId: 12345, createdAt: new Date().toISOString() },
                { id: 2, telegramId: 54321, createdAt: new Date().toISOString() },
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
});
