import { Env } from '../index';

export interface Team {
  id: number;
  name: string;
  acronym: string | null;
  image_url: string | null;
}

export interface GameWinner {
  id: number | null;
  type: string;
}

export interface Game {
  id: number;
  position: number;
  status: 'not_started' | 'running' | 'finished';
  winner: GameWinner | null;
  winner_type: 'Team' | null;
  length: number | null;
  begin_at: string | null;
  end_at: string | null;
}

export interface Tournament {
  id: number;
  name: string;
  has_bracket: boolean;
  winner_id: number | null;
  winner_type: 'Team' | 'Player' | null;
}

export interface Match {
  id: number;
  begin_at: string;
  end_at: string | null;
  status: 'not_started' | 'running' | 'finished' | 'canceled';
  name: string;
  number_of_games?: number;
  winner: Team | null;
  league: {
    name: string;
    image_url: string | null;
  };
  serie: {
    full_name: string;
  };
  tournament_id?: number | null;
  tournament?: Tournament | null;
  opponents: Array<{
    opponent: Team;
    type: 'Team';
  }>;
  results: Array<{
    score: number;
    team_id: number;
  }>;
  games: Game[];
  streams_list: Array<{
    raw_url: string;
    embed_url: string;
    language: string;
    official: boolean;
    main: boolean;
  }>;
}

export interface StandingTeam {
  id: number;
  name: string;
}

export interface BracketStanding {
  rank: number;
  team: StandingTeam;
  last_match: {
    id: number;
    status: string;
    winner_id: number | null;
  } | null;
}

export interface GroupStanding {
  rank: number;
  team: StandingTeam;
  wins: number;
  losses: number;
}

export type TournamentStanding = BracketStanding | GroupStanding;

const TEAMS_CACHE_KEY = 'pandascore_teams_cache';
const TEAMS_CACHE_TTL_SECONDS = 3600;

export class PandaScoreClient {
    private readonly apiRoot: string = 'https://api.pandascore.co';
    private readonly baseUrl: string = 'https://api.pandascore.co/dota2';
    private readonly token: string;
    private readonly kv: KVNamespace;

    constructor(env: Env) {
        this.token = env.PANDASCORE_TOKEN;
        this.kv = env.NOTIFICATIONS_KV;
        if (!this.token) {
            console.error('PANDASCORE_TOKEN is not configured');
        }
    }

    private async fetchJson<T>(url: URL, params?: Record<string, any>): Promise<T> {
        if (params) {
            for (const key in params) {
                if (Object.prototype.hasOwnProperty.call(params, key)) {
                    url.searchParams.append(key, String(params[key]));
                }
            }
        }

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

    private async request<T>(
        endpoint: string,
        params?: Record<string, any>,
    ): Promise<T> {
        return this.fetchJson<T>(new URL(`${this.baseUrl}${endpoint}`), params);
    }

    private async requestRoot<T>(
        endpoint: string,
        params?: Record<string, any>,
    ): Promise<T> {
        return this.fetchJson<T>(new URL(`${this.apiRoot}${endpoint}`), params);
    }

    private async fetchAllTeams(): Promise<Team[]> {
        const allTeams: Team[] = [];
        const pageSize = 50;
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= 10) {
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
        return allTeams;
    }

    private async getAllTeamsCached(): Promise<Team[]> {
        const cached = await this.kv.get(TEAMS_CACHE_KEY);
        if (cached) {
            try {
                console.log('[PandaScore] Using cached team list');
                return JSON.parse(cached) as Team[];
            } catch (e) {
                console.error('[PandaScore] Failed to parse cached team list, refetching:', e);
            }
        }

        const allTeams = await this.fetchAllTeams();
        await this.kv.put(TEAMS_CACHE_KEY, JSON.stringify(allTeams), { expirationTtl: TEAMS_CACHE_TTL_SECONDS });
        return allTeams;
    }

    async searchTeams(name: string): Promise<Team[]> {
        console.log(`[PandaScore] Searching for teams with query: "${name}"`);

        /*
         * PandaScore's search parameter doesn't work reliably, so we fetch the
         * full team list (cached in KV) and filter client-side instead.
         */
        const allTeams = await this.getAllTeamsCached();

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

    async getRunningMatches(teamIds: number[]): Promise<Match[]> {
        if (teamIds.length === 0) {
            return [];
        }
        return this.request<Match[]>('/matches/running', {
            'filter[opponent_id]': teamIds.join(','),
            'page[size]': 50,
        });
    }

    async getRecentlyFinishedMatches(teamIds: number[]): Promise<Match[]> {
        if (teamIds.length === 0) {
            return [];
        }
        const now = new Date();
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        return this.request<Match[]>('/matches/past', {
            'filter[opponent_id]': teamIds.join(','),
            'range[end_at]': `${twoHoursAgo.toISOString()},${now.toISOString()}`,
            sort: '-end_at',
            'page[size]': 50,
        });
    }

    async getMatchById(matchId: number): Promise<Match> {
        return this.request<Match>(`/matches/${matchId}`);
    }

    async getTournamentStandings(tournamentId: number): Promise<TournamentStanding[]> {
        return this.requestRoot<TournamentStanding[]>(`/tournaments/${tournamentId}/standings`);
    }
}
