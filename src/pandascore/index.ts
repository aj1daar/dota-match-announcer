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
  end_at: string | null;
}

export interface Serie {
  id: number;
  winner_id: number | null;
  tournaments: Array<{
    id: number;
    begin_at: string | null;
    end_at: string | null;
  }>;
}

export interface Match {
  id: number;
  begin_at: string;
  end_at: string | null;
  status: 'not_started' | 'running' | 'finished' | 'canceled';
  name: string;
  number_of_games?: number;
  winner: Team | null;
  draw?: boolean;
  league: {
    name: string;
    image_url: string | null;
  };
  serie_id?: number | null;
  serie: {
    full_name: string;
    winner_id?: number | null;
  };
  tournament_id?: number | null;
  tournament?: Tournament | null;
  opponents: Array<{
    opponent: Team | null;
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

const TEAMS_CACHE_KEY = 'pandascore_teams_cache';
const TEAMS_CACHE_TTL_SECONDS = 3600;

// PandaScore's maximum page size.
const MATCHES_PAGE_SIZE = 100;
// Safety valve so a misbehaving API can never keep one run paging forever.
const MATCHES_MAX_PAGES = 10;
// Keeps the opponent filter (and with it the request URL) to a sane length.
const TEAM_IDS_PER_REQUEST = 50;

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

        return this.refreshTeamsCache();
    }

    private async refreshTeamsCache(): Promise<Team[]> {
        const allTeams = await this.fetchAllTeams();
        await this.kv.put(TEAMS_CACHE_KEY, JSON.stringify(allTeams), { expirationTtl: TEAMS_CACHE_TTL_SECONDS });
        return allTeams;
    }

    private filterTeams(teams: Team[], name: string): Team[] {
        const lowerName = name.toLowerCase();
        return teams.filter(team => {
            const nameMatch = team.name.toLowerCase().includes(lowerName);
            const acronymMatch = team.acronym && team.acronym.toLowerCase().includes(lowerName);
            return nameMatch || acronymMatch;
        });
    }

    async searchTeams(name: string): Promise<Team[]> {
        console.log(`[PandaScore] Searching for teams with query: "${name}"`);

        /*
         * PandaScore's search parameter doesn't work reliably, so we fetch the
         * full team list (cached in KV) and filter client-side instead.
         */
        const allTeams = await this.getAllTeamsCached();
        let matchingTeams = this.filterTeams(allTeams, name);

        if (matchingTeams.length === 0) {
            /*
             * The cache can be up to an hour stale, which would hide a team that
             * was only just added or renamed. A search with zero hits is cheap
             * to double-check against a fresh fetch before giving up on it.
             */
            console.log('[PandaScore] No cached matches, refreshing team list before giving up');
            const freshTeams = await this.refreshTeamsCache();
            matchingTeams = this.filterTeams(freshTeams, name);
        }

        console.log(
            `[PandaScore] Found ${matchingTeams.length} teams matching "${name}":`,
            matchingTeams.map(t => t.name).join(', '),
        );

        return matchingTeams;
    }

    /*
     * Fetches every match on an endpoint for the given teams, not just the first
     * page: with enough followed teams a single page gets truncated, and the
     * matches that fall off the end would silently never be announced.
     */
    private async fetchAllMatches(
        endpoint: string,
        teamIds: number[],
        params: Record<string, any> = {},
    ): Promise<Match[]> {
        const matchesById = new Map<number, Match>();

        for (let start = 0; start < teamIds.length; start += TEAM_IDS_PER_REQUEST) {
            const teamIdChunk = teamIds.slice(start, start + TEAM_IDS_PER_REQUEST);

            for (let page = 1; page <= MATCHES_MAX_PAGES; page++) {
                const matches = await this.request<Match[]>(endpoint, {
                    ...params,
                    'filter[opponent_id]': teamIdChunk.join(','),
                    'page[size]': MATCHES_PAGE_SIZE,
                    'page[number]': page,
                });

                // Two followed teams facing each other can come back once per chunk.
                for (const match of matches) {
                    if (!matchesById.has(match.id)) matchesById.set(match.id, match);
                }

                if (matches.length < MATCHES_PAGE_SIZE) break;
                if (page === MATCHES_MAX_PAGES) {
                    console.error(`[PandaScore] ${endpoint} still had results after ${MATCHES_MAX_PAGES} pages; the rest were skipped`);
                }
            }
        }

        return Array.from(matchesById.values());
    }

    async getUpcomingMatches(teamIds: number[]): Promise<Match[]> {
        if (teamIds.length === 0) {
            return [];
        }
        const matches = await this.fetchAllMatches('/matches/upcoming', teamIds, { sort: 'begin_at' });
        // Each request is sorted, but results merged from several requests are not.
        return matches.sort((a, b) => new Date(a.begin_at).getTime() - new Date(b.begin_at).getTime());
    }

    async getRunningMatches(teamIds: number[]): Promise<Match[]> {
        if (teamIds.length === 0) {
            return [];
        }
        return this.fetchAllMatches('/matches/running', teamIds);
    }

    async getRecentlyFinishedMatches(teamIds: number[]): Promise<Match[]> {
        if (teamIds.length === 0) {
            return [];
        }
        const now = new Date();
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        return this.fetchAllMatches('/matches/past', teamIds, {
            'range[end_at]': `${twoHoursAgo.toISOString()},${now.toISOString()}`,
            sort: '-end_at',
        });
    }

    async getMatchById(matchId: number): Promise<Match> {
        return this.request<Match>(`/matches/${matchId}`);
    }

    async getSerieById(serieId: number): Promise<Serie> {
        return this.requestRoot<Serie>(`/series/${serieId}`);
    }
}
