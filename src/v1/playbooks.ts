import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { webOriginFromApiBase } from '../resources/playbooks.js';
import type { AlvaId } from '../types.js';

// Keyless Playbook discovery on /api/v1, with its 0.x types and IDs: every
// /api/v2 read needs an API key.

export type TrendingPlaybooksSort = 'FOLLOWS' | 'RECENT';
export type TrendingPlaybooksDir = 'FORWARD' | 'BACKWARD';

export interface TrendingPlaybooksParams {
  /** Opaque cursor returned on a previous item. Alias of `current`. */
  cursor?: string;
  /** GraphQL-compatible cursor field name. Alias of `cursor`. */
  current?: string;
  /** Page size, default 50, max 100 server-side. */
  limit?: number;
  dir?: TrendingPlaybooksDir;
  /** FOLLOWS = most followed, RECENT = newest first. */
  sort?: TrendingPlaybooksSort;
  /** Optional AND-filter tags. */
  tags?: string[];
  /** Optional weighted search across playbook and creator fields. */
  keyword?: string;
}

export interface TrendingPlaybookItem {
  id: AlvaId;
  /** Stable "owner/name" handle. */
  ref: string;
  /** Owner username. */
  username: string;
  /** URL-safe playbook name. */
  name: string;
  display_name: string;
  description: string;
  tags: string[];
  follow_count: number;
  /** Relative web path, e.g. `/u/alice/playbooks/btc`. */
  url_path: string;
  /** Absolute web URL, e.g. `https://alva.ai/u/alice/playbooks/btc`. */
  url: string;
  /** README ALFS path when available. */
  readme?: string;
  /** Cursor of the next page on the last item of a page that has one. */
  cursor: string;
}

export interface TrendingPlaybooksResponse {
  playbooks: TrendingPlaybookItem[];
  has_next: boolean;
}

/** Compact discovery record returned by getByIds / listByOwner / get. */
export interface PlaybookDiscoveryItem {
  id: AlvaId;
  /** Owner username (empty when not resolvable). */
  owner_username: string;
  /** URL-safe playbook name. */
  name: string;
  display_name: string;
  visibility: string;
  /** Stable "owner/name" handle. */
  ref?: string;
  /** Set on the last row of a listByOwner page that has a next page. */
  cursor?: string;
}

export interface DiscoveryByIDsResponse {
  items: PlaybookDiscoveryItem[];
}

export interface ListByOwnerParams {
  owner: string;
  /** Page size, default 50, max 100 server-side. */
  limit?: number;
  cursor?: string;
}

export interface ListByOwnerResponse {
  items: PlaybookDiscoveryItem[];
  has_next: boolean;
  next_cursor?: string;
}

interface RawTrendingPlaybooksResponse {
  playbooks?: RawTrendingPlaybook[];
  has_next?: boolean;
}

interface RawTrendingPlaybook {
  id?: string | number;
  name?: string;
  display_name?: string;
  description?: string;
  creator?: { name?: string };
  tags?: string[];
  follow_count?: number;
  readme?: string;
  cursor?: string;
}

/** `client.v1.playbooks`: public Playbook discovery without credentials. */
export class V1PlaybooksResource {
  constructor(private client: AlvaClient) {}

  /** Resolves Playbook IDs; IDs that are deleted or not visible have no row. Max 100. */
  async getByIds(ids: AlvaId[]): Promise<DiscoveryByIDsResponse> {
    if (ids.length === 0) return { items: [] };
    return (await this.client._request('GET', '/api/v1/playbooks', {
      query: { ids: ids.join(',') },
    })) as DiscoveryByIDsResponse;
  }

  /** A user's public Playbooks by username. */
  async listByOwner(params: ListByOwnerParams): Promise<ListByOwnerResponse> {
    const query: Record<string, string> = { owner: params.owner };
    if (params.limit !== undefined && params.limit > 0) {
      query.limit = String(params.limit);
    }
    if (params.cursor) query.cursor = params.cursor;
    return (await this.client._request('GET', '/api/v1/playbooks', {
      query,
    })) as ListByOwnerResponse;
  }

  /** One Playbook by id or "owner/name" ref; null when not found or not visible. */
  async get(params: {
    id?: AlvaId;
    ref?: string;
  }): Promise<PlaybookDiscoveryItem | null> {
    if (params.id) {
      const resp = await this.getByIds([params.id]);
      return resp.items[0] ?? null;
    }
    if (params.ref) {
      const slash = params.ref.indexOf('/');
      if (slash <= 0 || slash === params.ref.length - 1) {
        throw new AlvaError(
          'INVALID_ARGUMENT',
          `Invalid ref "${params.ref}". Expected "owner/name".`,
          400
        );
      }
      const owner = params.ref.slice(0, slash);
      const name = params.ref.slice(slash + 1);
      let cursor: string | undefined;
      // Owner catalogs are small: page until the name matches.
      for (;;) {
        const page = await this.listByOwner({ owner, cursor, limit: 100 });
        const hit = page.items.find((item) => item.name === name);
        if (hit) return hit;
        if (!page.has_next || !page.next_cursor) return null;
        cursor = page.next_cursor;
      }
    }
    throw new AlvaError('INVALID_ARGUMENT', 'id or ref is required', 400);
  }

  /** Trending or searched public Playbooks, in an agent-friendly shape. */
  async trending(
    params: TrendingPlaybooksParams = {}
  ): Promise<TrendingPlaybooksResponse> {
    const query: Record<string, string | number> = {};
    if (params.cursor) query.cursor = params.cursor;
    if (params.current) query.current = params.current;
    if (params.limit !== undefined) query.limit = params.limit;
    if (params.dir) query.dir = params.dir;
    if (params.sort) query.sort = params.sort;
    if (params.keyword) query.keyword = params.keyword;
    if (params.tags && params.tags.length > 0) {
      query.tags = params.tags.join(',');
    }
    const raw = (await this.client._request(
      'GET',
      '/api/v1/playbooks/trending',
      { query }
    )) as RawTrendingPlaybooksResponse;
    const webOrigin = webOriginFromApiBase(this.client.baseUrl);
    return {
      playbooks: (raw.playbooks ?? []).map((p) => agentPlaybook(p, webOrigin)),
      has_next: raw.has_next ?? false,
    };
  }
}

function agentPlaybook(
  raw: RawTrendingPlaybook,
  webOrigin: string
): TrendingPlaybookItem {
  const username = raw.creator?.name ?? '';
  const name = raw.name ?? '';
  const ref = username && name ? `${username}/${name}` : name;
  const urlPath = username && name ? `/u/${username}/playbooks/${name}` : '';
  return {
    id: raw.id === undefined ? '' : String(raw.id),
    ref,
    username,
    name,
    display_name: raw.display_name ?? '',
    description: raw.description ?? '',
    tags: raw.tags ?? [],
    follow_count: raw.follow_count ?? 0,
    url_path: urlPath,
    url: urlPath ? `${webOrigin}${urlPath}` : '',
    ...(raw.readme ? { readme: raw.readme } : {}),
    cursor: raw.cursor ?? '',
  };
}
