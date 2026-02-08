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
    }

    private async request<T>(
        endpoint: string,
        params?: Record<string, any>,
    ): Promise<T> {
        const url = new URL(`${this.baseUrl}${endpoint}`);
        url.searchParams.append('token', this.token);
        if (params) {
            for (const key in params) {
                if (Object.prototype.hasOwnProperty.call(params, key)) {
                    url.searchParams.append(key, String(params[key]));
                }
            }
        }

        const response = await fetch(url.toString());

        if (!response.ok) {
            console.error(
                `PandaScore API error: ${response.status} ${response.statusText}`,
            );
            throw new Error(`PandaScore API error: ${response.statusText}`);
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
