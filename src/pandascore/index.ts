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
        return this.request<Team[]>('/teams', { search: name });
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
