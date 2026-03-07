import { Env } from '../index';

export interface Team {
  id: number;
  name: string;
  acronym: string | null;
  image_url: string | null;
}

export interface Match {
  id: number;
  begin_at: string;
  end_at: string | null;
  status: 'not_started' | 'running' | 'finished' | 'canceled';
  name: string;
  number_of_games?: number;
  league: {
    name: string;
    image_url: string | null;
  };
  serie: {
    full_name: string;
  };
  opponents: Array<{
    opponent: Team;
    type: 'Team';
  }>;
  results: Array<{
    score: number;
    opponent_id: number;
  }>;
  streams_list: Array<{
    raw_url: string;
    embed_url: string;
    language: string;
    official: boolean;
    main: boolean;
  }>;
}

export class PandaScoreClient {
    private readonly baseUrl: string = 'https://api.pandascore.co/dota2';
    private readonly token: string;

    constructor(env: Env) {
        this.token = env.PANDASCORE_TOKEN;
        if (!this.token) {
            console.error('PANDASCORE_TOKEN is not configured');
        }
    }

    private async request<T>(
        endpoint: string,
        params?: Record<string, any>,
    ): Promise<T> {
        const url = new URL(`${this.baseUrl}${endpoint}`);

        // Add query parameters
        if (params) {
            for (const key in params) {
                if (Object.prototype.hasOwnProperty.call(params, key)) {
                    url.searchParams.append(key, String(params[key]));
                }
            }
        }

        // Make request with Authorization header
        console.log(`[PandaScore] Requesting: ${url.toString()}`);
        const response = await fetch(url.toString(), {
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error(
                `PandaScore API error: ${response.status} ${response.statusText}`,
                'Response:', errorText,
                'Token present:', !!this.token,
                'Token length:', this.token?.length || 0,
            );
            throw new Error(`PandaScore API error: ${response.status} ${response.statusText}`);
        }

        return response.json() as Promise<T>;
    }

    async searchTeams(name: string): Promise<Team[]> {
        console.log(`[PandaScore] Searching for teams with query: "${name}"`);

        /*
         * Fetch all teams with pagination
         * PandaScore's search parameter doesn't work reliably, so we implement client-side filtering
         */
        const allTeams: Team[] = [];
        const pageSize = 50;
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= 10) {
            // Limit to 10 pages to avoid excessive API calls
            console.log(`[PandaScore] Fetching teams page ${page}...`);

            const teams = await this.request<Team[]>('/teams', {
                'page[size]': pageSize,
                'page[number]': page,
                sort: '-modified_at',
            });

            if (teams.length === 0) {
                hasMore = false;
            } else {
                allTeams.push(...teams);
                page++;
            }
        }

        console.log(`[PandaScore] Fetched ${allTeams.length} total teams`);

        // Client-side filtering
        const lowerName = name.toLowerCase();
        const matchingTeams = allTeams.filter(team => {
            const nameMatch = team.name.toLowerCase().includes(lowerName);
            const acronymMatch = team.acronym && team.acronym.toLowerCase().includes(lowerName);
            return nameMatch || acronymMatch;
        });

        console.log(
            `[PandaScore] Found ${matchingTeams.length} teams matching "${name}":`,
            matchingTeams.map(t => t.name).join(', '),
        );

        return matchingTeams;
    }

    async getUpcomingMatches(teamIds: number[]): Promise<Match[]> {
        if (teamIds.length === 0) {
            return [];
        }
        return this.request<Match[]>('/matches/upcoming', {
            sort: 'begin_at',
            'filter[opponent_id]': teamIds.join(','),
            'page[size]': 50,
        });
    }
}
