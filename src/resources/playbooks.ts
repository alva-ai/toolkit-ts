import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { v2Path, type Page } from '../platformApi.js';
import type { AlvaId } from '../types.js';

/** Playbook visibility states understood by the gateway. */
export type PlaybookVisibility = 'public' | 'private' | 'paid';

export const PLAYBOOK_VISIBILITIES: readonly PlaybookVisibility[] = [
  'public',
  'private',
  'paid',
];

export interface SetVisibilityParams {
  /** URL-safe name of one of the caller's playbooks. */
  name: string;
  /** Target visibility: public, private, or paid. */
  visibility: PlaybookVisibility;
}

export interface SetVisibilityResponse {
  /** The playbook's ALFS directory. */
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
  /** Playbook ID. */
  id: AlvaId;
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
  /** Relative web path for opening or citing the playbook, e.g. `/u/alice/playbooks/btc`. */
  url_path: string;
  /** Absolute, clickable web URL, e.g. `https://alva.ai/u/alice/playbooks/btc`. */
  url: string;
  /** README ALFS path when available. */
  readme?: string;
  /**
   * Cursor to pass as `cursor` / `current` for the next page: set on the
   * last item of a page that has one, empty on the others.
   */
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
  /** Playbook ID. */
  id: AlvaId;
  /** Owner username (empty when not resolvable). */
  owner_username: string;
  /** URL-safe playbook name. */
  name: string;
  display_name: string;
  visibility: string;
  /** Stable "owner/name" handle for name-addressed operations. */
  ref?: string;
  /** Present on listByOwner rows; set on the last row of a page that has a next page. */
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

/** Lifecycle filters for the owner-scoped list (GET /api/v2/me/playbooks). */
export const OWNED_PLAYBOOK_FILTERS = ['draft', 'running', 'paused'] as const;

export type OwnedPlaybookFilter = (typeof OWNED_PLAYBOOK_FILTERS)[number];

export interface ListOwnParams {
  /** draft | running | paused. Omit to list all your published playbooks. */
  filter?: OwnedPlaybookFilter;
  /** Page size, default 50, max 100 server-side. */
  limit?: number;
  cursor?: string;
}

/** One row from the owner-scoped list (GET /api/v2/me/playbooks). */
export interface OwnedPlaybookItem {
  /** Playbook ID. */
  id: AlvaId;
  /** URL-safe playbook name. */
  name: string;
  display_name?: string;
  visibility?: string;
  created_at?: string;
  updated_at?: string;
  /** Cursor to pass as `cursor` for the next page; set on the last row of a page that has one. */
  cursor?: string;
}

export interface ListOwnResponse {
  playbooks: OwnedPlaybookItem[];
  has_next: boolean;
  /** The next page's cursor; absent on the last page. */
  next_cursor?: string;
}

export class PlaybooksResource {
  constructor(private client: AlvaClient) {}

  /**
   * Resolve playbook ids to named, addressable records (mono-meta#584 A2).
   * Visibility-gated server-side; ids the caller cannot see — and DELETED
   * playbook ids — return no row. Treat a missing id as "deleted or not
   * visible" (the subscriptions list's `target_status` distinguishes ghosts).
   * Max 100 per call.
   *
   * Auth is optional (like `trending`): with an API key, /api/v2 evaluates
   * private/paid visibility for the caller; without one (see
   * `AlvaClient._sendsApiKey`) the /api/v1 catalog answers as in 0.x, with
   * 0.x IDs.
   */
  async getByIds(ids: AlvaId[]): Promise<DiscoveryByIDsResponse> {
    if (!this.client._sendsApiKey()) {
      return (await this.client._request('GET', '/api/v1/playbooks', {
        query: { ids: ids.join(',') },
      })) as DiscoveryByIDsResponse;
    }
    const page = await this.client._v2Request<Page<WirePlaybook>>(
      'GET',
      '/playbooks',
      { query: { ids, pageSize: 100 } }
    );
    return { items: page.items.map(discoveryItem) };
  }

  /**
   * List a user's playbooks by owner username (mono-meta#584 C10).
   * Visibility-gated: another user's private playbooks are omitted.
   * Auth is optional (like `trending`); without credentials only public
   * playbooks are listed.
   */
  async listByOwner(params: ListByOwnerParams): Promise<ListByOwnerResponse> {
    if (!this.client._sendsApiKey()) {
      const query: Record<string, string> = { owner: params.owner };
      if (params.limit !== undefined && params.limit > 0) {
        query.limit = String(params.limit);
      }
      if (params.cursor) query.cursor = params.cursor;
      return (await this.client._request('GET', '/api/v1/playbooks', {
        query,
      })) as ListByOwnerResponse;
    }
    const page = await this.client._v2Request<Page<WirePlaybook>>(
      'GET',
      '/playbooks',
      {
        query: {
          owner: params.owner,
          pageSize: pageSize(params.limit),
          pageToken: params.cursor || undefined,
        },
      }
    );
    return {
      items: withPageCursor(page, discoveryItem),
      has_next: page.nextPageToken !== null,
      ...(page.nextPageToken === null
        ? {}
        : { next_cursor: page.nextPageToken }),
    };
  }

  /**
   * List the authenticated user's OWN playbooks via GET /api/v2/me/playbooks
   * — the owner-scoped surface that INCLUDES drafts. Unlike `listByOwner` (the
   * public discovery view, which requires at least one release and therefore
   * hides drafts), this shows work-in-progress playbooks you created but
   * never released. Requires a credential: the owner is derived from auth,
   * not a username argument. Optional `filter` narrows to draft | running |
   * paused.
   */
  async listOwn(params: ListOwnParams = {}): Promise<ListOwnResponse> {
    const page = await this.client._v2Request<Page<WirePlaybook>>(
      'GET',
      '/me/playbooks',
      {
        query: {
          status: params.filter?.toUpperCase(),
          pageSize: pageSize(params.limit),
          pageToken: params.cursor || undefined,
        },
      }
    );
    return {
      playbooks: withPageCursor(page, (p) => ({
        id: p.id,
        name: p.slug,
        display_name: p.title,
        visibility: p.visibility.toLowerCase(),
        created_at: p.createdAt,
        updated_at: p.updatedAt,
      })),
      has_next: page.nextPageToken !== null,
      ...(page.nextPageToken === null
        ? {}
        : { next_cursor: page.nextPageToken }),
    };
  }

  /**
   * Get one playbook by id or by "owner/name" ref. Returns null when not
   * found / not visible / deleted.
   */
  async get(params: {
    id?: AlvaId;
    ref?: string;
  }): Promise<PlaybookDiscoveryItem | null> {
    if (params.id) {
      if (!this.client._sendsApiKey()) {
        const resp = await this.getByIds([params.id]);
        return resp.items[0] ?? null;
      }
      return orNull(
        this.client._v2Request<WirePlaybook>(
          'GET',
          v2Path`/playbooks/${params.id}`
        )
      );
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
      if (this.client._sendsApiKey()) {
        return orNull(playbookBySlug(this.client, owner, name));
      }
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
   * List trending / searchable playbooks. Auth is optional: with an API key
   * this reads /api/v2, otherwise the /api/v1 surface (0.x IDs).
   *
   * The SDK projects the catalog into a smaller, agent-friendly shape.
   */
  async trending(
    params: TrendingPlaybooksParams = {}
  ): Promise<TrendingPlaybooksResponse> {
    const webOrigin = webOriginFromApiBase(this.client.baseUrl);
    if (!this.client._sendsApiKey()) {
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
        playbooks: (raw.playbooks ?? []).map((p) =>
          toAgentPlaybook(p, webOrigin)
        ),
        has_next: raw.has_next ?? false,
      };
    }

    if (params.dir === 'BACKWARD') {
      throw new AlvaError(
        'INVALID_ARGUMENT',
        'backward pagination is not supported for trending playbooks',
        400
      );
    }
    if (params.dir !== undefined && params.dir !== 'FORWARD') {
      throw new AlvaError(
        'INVALID_ARGUMENT',
        'dir must be one of: FORWARD, BACKWARD',
        400
      );
    }
    if (params.sort !== undefined && !(params.sort in TRENDING_ORDER)) {
      throw new AlvaError(
        'INVALID_ARGUMENT',
        'sort must be one of: FOLLOWS, RECENT',
        400
      );
    }
    const page = await this.client._v2Request<Page<WirePlaybook>>(
      'GET',
      '/playbooks',
      {
        query: {
          orderBy: params.sort && TRENDING_ORDER[params.sort],
          tags: params.tags?.length ? params.tags : undefined,
          query: params.keyword || undefined,
          pageSize: params.limit,
          pageToken: params.cursor || params.current || undefined,
        },
      }
    );
    return {
      playbooks: withPageCursor(page, (p) =>
        toAgentPlaybook(
          {
            id: p.id,
            name: p.slug,
            display_name: p.title,
            description: p.description,
            creator: { name: p.owner?.handle },
            tags: p.tags,
            follow_count: p.followerCount,
            readme: p.readmePath ?? undefined,
          },
          webOrigin
        )
      ),
      has_next: page.nextPageToken !== null,
    };
  }

  /**
   * Set a playbook's visibility. Requires authentication; the playbook is the
   * caller's own, named by `name`.
   *
   * Note: `private` and `paid` are paid-tier capabilities. A free-tier user
   * receives a `PERMISSION_DENIED` error from the gateway, which is surfaced
   * here unchanged. Leaving `paid` while subscriptions renew is refused with
   * `CONFLICT`.
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
    const playbook = await ownPlaybook(this.client, params.name);
    const updated = await this.client._v2Request<WirePlaybook>(
      'PATCH',
      v2Path`/playbooks/${playbook.id}`,
      {
        // v1 always confirmed the exposure of bundled feeds.
        body: {
          visibility: params.visibility.toUpperCase(),
          confirmBundledFeedExposure: true,
        },
      }
    );
    return { playbook_path: updated.path ?? '' };
  }
}

/** A Playbook as /api/v2 returns it. */
export interface WirePlaybook {
  id: AlvaId;
  slug: string;
  title: string;
  description: string;
  visibility: string;
  tags: string[];
  path: string | null;
  readmePath: string | null;
  followerCount: number;
  owner: { id: AlvaId | null; handle: string } | null;
  createdAt: string;
  updatedAt: string;
}

const TRENDING_ORDER: Record<TrendingPlaybooksSort, string> = {
  FOLLOWS: 'MOST_FOLLOWED',
  RECENT: 'NEWEST',
};

/** A Playbook by its owner's username and its slug. */
export function playbookBySlug(
  client: AlvaClient,
  owner: string,
  slug: string
): Promise<WirePlaybook> {
  return client._v2Request<WirePlaybook>(
    'GET',
    v2Path`/playbooks/by-slug/${owner}/${slug}`
  );
}

/** One of the caller's own Playbooks, by slug. */
export async function ownPlaybook(
  client: AlvaClient,
  slug: string
): Promise<WirePlaybook> {
  return playbookBySlug(client, await client.user._username(), slug);
}

function discoveryItem(p: WirePlaybook): PlaybookDiscoveryItem {
  const owner = p.owner?.handle ?? '';
  return {
    id: p.id,
    owner_username: owner,
    name: p.slug,
    display_name: p.title,
    visibility: p.visibility.toLowerCase(),
    ...(owner && p.slug ? { ref: `${owner}/${p.slug}` } : {}),
  };
}

/**
 * Maps a page whose rows carry a cursor. /api/v2 has one token per page, so
 * the last row carries it and the others an empty cursor.
 */
function withPageCursor<T>(
  page: Page<WirePlaybook>,
  map: (p: WirePlaybook) => T
): (T & { cursor: string })[] {
  return page.items.map((p, i) => ({
    ...map(p),
    cursor:
      i === page.items.length - 1 && page.nextPageToken !== null
        ? page.nextPageToken
        : '',
  }));
}

function pageSize(limit: number | undefined): number | undefined {
  return limit !== undefined && limit > 0 ? limit : undefined;
}

/** A Playbook the caller cannot see (404 or 403) is null. */
async function orNull(
  read: Promise<WirePlaybook>
): Promise<PlaybookDiscoveryItem | null> {
  try {
    return discoveryItem(await read);
  } catch (err) {
    if (err instanceof AlvaError && (err.status === 404 || err.status === 403))
      return null;
    throw err;
  }
}

/**
 * Derive the user-facing web origin (where playbooks are browsable) from the
 * API base URL. Playbooks live at `<web-origin>/u/<owner>/playbooks/<name>`.
 * Mirrors the env family: `api-llm.prd.alva.ai` → `https://alva.ai`,
 * `api-llm.stg.alva.ai` → `https://stg.alva.ai`. Falls back to
 * `https://alva.ai` for unrecognized hosts (custom base URLs, local-dev).
 */
export function webOriginFromApiBase(apiBaseUrl: string): string {
  try {
    const host = new URL(apiBaseUrl).hostname;
    const match = /^api-llm\.([a-z0-9-]+)\.alva\.ai$/i.exec(host);
    if (match) {
      const env = match[1].toLowerCase();
      return env === 'prd' ? 'https://alva.ai' : `https://${env}.alva.ai`;
    }
  } catch {
    // Malformed base URL — fall through to the default origin.
  }
  return 'https://alva.ai';
}

function toAgentPlaybook(
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
