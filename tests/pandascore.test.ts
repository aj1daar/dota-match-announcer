import { PandaScoreClient, Team, Match, TournamentStanding } from '../src/pandascore';
import { Env } from '../src';

describe('PandaScoreClient', () => {
    let client: PandaScoreClient;
    let mockKv: { get: jest.Mock; put: jest.Mock };
    let mockEnv: Env;

    beforeEach(() => {
        fetchMock.resetMocks();
        mockKv = {
            get: jest.fn().mockResolvedValue(null),
            put: jest.fn().mockResolvedValue(undefined),
        };
        mockEnv = {
            PANDASCORE_TOKEN: 'test-token',
            NOTIFICATIONS_KV: mockKv,
        } as unknown as Env;
        client = new PandaScoreClient(mockEnv);
    });

    describe('searchTeams', () => {
        it('should filter teams by name on successful search', async () => {
            const allTeams: Team[] = [
                { id: 1, name: 'Test Team 1', acronym: 'TT1', image_url: null },
                { id: 2, name: 'Other Team', acronym: 'OT', image_url: null },
                { id: 3, name: 'Test Team 2', acronym: 'TT2', image_url: null },
            ];

            // Mock first page of results
            fetchMock.mockResponseOnce(JSON.stringify(allTeams));
            // Mock second page returns empty (no more pages)
            fetchMock.mockResponseOnce(JSON.stringify([]));

            const teams = await client.searchTeams('Test');

            // Should return only teams matching "Test" in name
            expect(teams.length).toEqual(2);
            expect(teams[0].name).toEqual('Test Team 1');
            expect(teams[1].name).toEqual('Test Team 2');

            // Verify Authorization header is used
            const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
            expect(requestInit.headers).toEqual({
                'Authorization': 'Bearer test-token',
                'Accept': 'application/json',
            });
            // Verify token is NOT in query params
            expect(fetchMock.mock.calls[0][0]).not.toContain('token=');
        });

        it('should filter teams by acronym as well', async () => {
            const allTeams: Team[] = [
                { id: 1, name: 'Team One', acronym: 'TT', image_url: null },
                { id: 2, name: 'Other Team', acronym: 'OT', image_url: null },
            ];

            fetchMock.mockResponseOnce(JSON.stringify(allTeams));
            fetchMock.mockResponseOnce(JSON.stringify([]));

            const teams = await client.searchTeams('OT');

            expect(teams.length).toEqual(1);
            expect(teams[0].name).toEqual('Other Team');
        });

        it('should throw an error if the API returns a non-200 response', async () => {
            fetchMock.mockResponseOnce('Not Found', { status: 404 });
            await expect(client.searchTeams('Test')).rejects.toThrow(
                'PandaScore API error: 404 Not Found',
            );
        });

        it('should cache the fetched team list in KV after a cache miss', async () => {
            const allTeams: Team[] = [
                { id: 1, name: 'Test Team 1', acronym: 'TT1', image_url: null },
            ];
            fetchMock.mockResponseOnce(JSON.stringify(allTeams));
            fetchMock.mockResponseOnce(JSON.stringify([]));

            await client.searchTeams('Test');

            expect(mockKv.get).toHaveBeenCalledWith('pandascore_teams_cache');
            expect(mockKv.put).toHaveBeenCalledWith(
                'pandascore_teams_cache',
                JSON.stringify(allTeams),
                { expirationTtl: 3600 },
            );
        });

        it('should use the cached team list and skip the API when the cache is warm', async () => {
            const cachedTeams: Team[] = [
                { id: 1, name: 'Cached Team', acronym: 'CT', image_url: null },
                { id: 2, name: 'Other Team', acronym: 'OT', image_url: null },
            ];
            mockKv.get.mockResolvedValue(JSON.stringify(cachedTeams));

            const teams = await client.searchTeams('Cached');

            expect(teams).toEqual([cachedTeams[0]]);
            expect(fetchMock.mock.calls.length).toEqual(0);
            expect(mockKv.put).not.toHaveBeenCalled();
        });

        it('should refetch from the API if the cached value is corrupted', async () => {
            mockKv.get.mockResolvedValue('not valid json');
            const allTeams: Team[] = [
                { id: 1, name: 'Test Team 1', acronym: 'TT1', image_url: null },
            ];
            fetchMock.mockResponseOnce(JSON.stringify(allTeams));
            fetchMock.mockResponseOnce(JSON.stringify([]));

            const teams = await client.searchTeams('Test');

            expect(teams).toEqual(allTeams);
            expect(mockKv.put).toHaveBeenCalledWith(
                'pandascore_teams_cache',
                JSON.stringify(allTeams),
                { expirationTtl: 3600 },
            );
        });
    });

    describe('getUpcomingMatches', () => {
        it('should return an empty array if no team IDs are provided', async () => {
            const matches = await client.getUpcomingMatches([]);
            expect(matches).toEqual([]);
            expect(fetchMock.mock.calls.length).toEqual(0);
        });

        it('should return an array of matches for the given team IDs', async () => {
            const mockMatches: Match[] = [
                {
                    id: 1,
                    name: 'Match 1',
                    begin_at: '2026-02-08T12:00:00Z',
                    opponents: [],
                    league: { name: 'League 1', image_url: null },
                    serie: { full_name: 'Serie 1' },
                    status: 'not_started',
                    end_at: null,
                    winner: null,
                    games: [],
                    results: [],
                    streams_list: [],
                },
                {
                    id: 2,
                    name: 'Match 2',
                    begin_at: '2026-02-09T12:00:00Z',
                    opponents: [],
                    league: { name: 'League 2', image_url: null },
                    serie: { full_name: 'Serie 2' },
                    status: 'not_started',
                    end_at: null,
                    winner: null,
                    games: [],
                    results: [],
                    streams_list: [],
                },
            ];
            fetchMock.mockResponseOnce(JSON.stringify(mockMatches));

            const matches = await client.getUpcomingMatches([1, 2]);
            expect(matches).toEqual(mockMatches);
            expect(fetchMock.mock.calls.length).toEqual(1);

            const url = decodeURIComponent(fetchMock.mock.calls[0][0] as string);
            expect(url).toContain('/matches/upcoming');
            expect(url).toContain('filter[opponent_id]=1,2');
        });

        it('should throw an error if the API returns a non-200 response', async () => {
            fetchMock.mockResponseOnce('Internal Server Error', { status: 500 });
            await expect(client.getUpcomingMatches([1])).rejects.toThrow(
                'PandaScore API error: 500 Internal Server Error',
            );
        });
    });

    describe('getTournamentStandings', () => {
        it('should request the generic (non-/dota2) standings endpoint', async () => {
            const mockStandings: TournamentStanding[] = [
                { rank: 1, team: { id: 1, name: 'Team One' }, last_match: { id: 10, status: 'finished', winner_id: 1 } },
                { rank: 2, team: { id: 2, name: 'Team Two' }, last_match: { id: 9, status: 'finished', winner_id: 1 } },
            ];
            fetchMock.mockResponseOnce(JSON.stringify(mockStandings));

            const standings = await client.getTournamentStandings(42);
            expect(standings).toEqual(mockStandings);

            const url = fetchMock.mock.calls[0][0] as string;
            expect(url).toEqual('https://api.pandascore.co/tournaments/42/standings');
        });

        it('should throw an error if the API returns a non-200 response', async () => {
            fetchMock.mockResponseOnce('Not Found', { status: 404 });
            await expect(client.getTournamentStandings(42)).rejects.toThrow(
                'PandaScore API error: 404 Not Found',
            );
        });
    });
});
