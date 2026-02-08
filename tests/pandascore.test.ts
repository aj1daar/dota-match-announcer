import { PandaScoreClient, Team, Match } from '../src/pandascore';
import { Env } from '../src/index';

describe('PandaScoreClient', () => {
    let client: PandaScoreClient;
    const mockEnv = {
        PANDASCORE_TOKEN: 'test-token',
    } as Env;

    beforeEach(() => {
        fetchMock.resetMocks();
        client = new PandaScoreClient(mockEnv);
    });

    describe('searchTeams', () => {
        it('should return an array of teams on successful search', async () => {
            const mockTeams: Team[] = [
                { id: 1, name: 'Test Team 1', acronym: 'TT1', image_url: null },
                { id: 2, name: 'Test Team 2', acronym: 'TT2', image_url: null },
            ];
            fetchMock.mockResponseOnce(JSON.stringify(mockTeams));

            const teams = await client.searchTeams('Test');
            expect(teams).toEqual(mockTeams);
            expect(fetchMock.mock.calls.length).toEqual(1);
            expect(fetchMock.mock.calls[0][0]).toContain('/teams');
            expect(fetchMock.mock.calls[0][0]).toContain('search=Test');
        });

        it('should throw an error if the API returns a non-200 response', async () => {
            fetchMock.mockResponseOnce('Not Found', { status: 404 });
            await expect(client.searchTeams('Test')).rejects.toThrow(
                'PandaScore API error: Not Found',
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
                'PandaScore API error: Internal Server Error',
            );
        });
    });
});
