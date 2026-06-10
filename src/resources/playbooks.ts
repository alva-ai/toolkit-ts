import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';

/** Playbook visibility states understood by the gateway. */
export type PlaybookVisibility = 'public' | 'private' | 'paid';

export const PLAYBOOK_VISIBILITIES: readonly PlaybookVisibility[] = [
  'public',
  'private',
  'paid',
];

export interface SetVisibilityParams {
  /** URL-safe playbook name. The owner is derived server-side from auth. */
  name: string;
  /** Target visibility: public, private, or paid. */
  visibility: PlaybookVisibility;
}

export interface SetVisibilityResponse {
  /** ALFS-style "<owner>/<name>" path echoed back by the gateway. */
  playbook_path: string;
}

export type TrendingPlaybooksSort = 'FOLLOWS' | 'RECENT';
export type TrendingPlaybooksDir = 'FORWARD' | 'BACKWARD';

export interface TrendingPlaybooksParams {
  /** Opaque cursor returned on a previous item. Alias of `current`. */
  cursor?: string;
  /** GraphQL-compatible cursor field name. Alias of `cursor`. */
  current?: string;
  /** Page size, default 50, max 100 server-side. */
  limit?: number;
  /** Only FORWARD is supported by the gateway today. */
  dir?: TrendingPlaybooksDir;
  /** FOLLOWS = most followed, RECENT = newest first. */
  sort?: TrendingPlaybooksSort;
  /** Optional AND-filter tags. */
  tags?: string[];
  /** Optional weighted search across playbook and creator fields. */
  keyword?: string;
}

export interface TrendingPlaybookItem {
  /** Numeric playbook id encoded as a string. */
  id: string;
  /** Stable "owner/name" handle, useful for follow-up tool calls. */
  ref: string;
  /** Owner username. */
  username: string;
  /** URL-safe playbook name. */
  name: string;
  display_name: string;
  description: string;
  tags: string[];
  follow_count: number;
  /** Relative web path for opening or citing the playbook. */
  url_path: string;
  /** README ALFS path when available. */
  readme?: string;
  /** Cursor to pass as `cursor` / `current` for pagination. */
  cursor: string;
}

export interface TrendingPlaybooksResponse {
  playbooks: TrendingPlaybookItem[];
  has_next: boolean;
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

/**
 * Public playbook discovery. Backed by alva-gateway REST and mirrors the
 * GraphQL `trendingPlaybooks(cursor, sort, tags, keyword)` query.
 */
/** Compact discovery record returned by getByIds / listByOwner / get. */
export interface PlaybookDiscoveryItem {
  /** Numeric playbook id encoded as a string. */
  id: string;
  /** Owner username (empty when not resolvable). */
  owner_username: string;
  /** URL-safe playbook name. */
  name: string;
  display_name: string;
  visibility: string;
  /** Stable "owner/name" handle for name-addressed operations. */
  ref?: string;
  /** Present on listByOwner rows. */
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

export class PlaybooksResource {
  constructor(private client: AlvaClient) {}

  /**
   * Resolve playbook ids to named, addressable records (mono-meta#584 A2).
   * Visibility-gated server-side; ids the caller cannot see — and DELETED
   * playbook ids — return no row. Treat a missing id as "deleted or not
   * visible" (the subscriptions list's `target_status` distinguishes ghosts).
   * Ids are strings (snowflake-safe). Max 100 per call.
   *
   * Auth is optional (like `trending`): with an API key, private/paid
   * visibility is evaluated for the caller; without one, only public
   * playbooks resolve. The server decides — no client-side gate.
   */
  async getByIds(ids: string[]): Promise<DiscoveryByIDsResponse> {
    return (await this.client._request('GET', '/api/v1/playbooks', {
      query: { ids: ids.join(',') },
    })) as DiscoveryByIDsResponse;
  }

  /**
   * List a user's playbooks by owner username (mono-meta#584 C10).
   * Visibility-gated: another user's private playbooks are omitted.
   * Auth is optional (like `trending`); without credentials only public
   * playbooks are listed.
   */
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

  /**
   * Get one playbook by numeric id or by "owner/name" ref. Returns null when
   * not found / not visible / deleted.
   */
  async get(params: {
    id?: string;
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
      // Paginate the owner's playbooks until the name matches (bounded by
      // the server-side page cap; owner catalogs are small).
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

  /**
   * List trending / searchable playbooks. Auth is optional: when the client
   * has an API key it is forwarded, otherwise this uses the public surface.
   *
   * The gateway returns a frontend-oriented preview payload; this SDK projects
   * it into a smaller, agent-friendly shape.
   */
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

    return {
      playbooks: (raw.playbooks ?? []).map(toAgentPlaybook),
      has_next: raw.has_next ?? false,
    };
  }

  /**
   * Set a playbook's visibility. Requires authentication; the owner is
   * resolved server-side from the authenticated user, so only the playbook
   * `name` is needed.
   *
   * Note: `private` and `paid` are paid-tier capabilities. A free-tier user
   * receives a `PERMISSION_DENIED` error from the gateway, which is surfaced
   * here unchanged.
   */
  async setVisibility(
    params: SetVisibilityParams
  ): Promise<SetVisibilityResponse> {
    if (!PLAYBOOK_VISIBILITIES.includes(params.visibility)) {
      throw new AlvaError(
        'INVALID_ARGUMENT',
        `Invalid visibility "${params.visibility}". Expected one of: ${PLAYBOOK_VISIBILITIES.join(', ')}.`,
        400
      );
    }
    this.client._requireAuth();
    return (await this.client._request(
      'POST',
      `/api/v1/playbook/${encodeURIComponent(params.name)}/visibility`,
      { body: { visibility: params.visibility } }
    )) as SetVisibilityResponse;
  }
}

function toAgentPlaybook(raw: RawTrendingPlaybook): TrendingPlaybookItem {
  const username = raw.creator?.name ?? '';
  const name = raw.name ?? '';
  const ref = username && name ? `${username}/${name}` : name;
  return {
    id: raw.id === undefined ? '' : String(raw.id),
    ref,
    username,
    name,
    display_name: raw.display_name ?? '',
    description: raw.description ?? '',
    tags: raw.tags ?? [],
    follow_count: raw.follow_count ?? 0,
    url_path: username && name ? `/${username}/playbooks/${name}` : '',
    ...(raw.readme ? { readme: raw.readme } : {}),
    cursor: raw.cursor ?? '',
  };
}
