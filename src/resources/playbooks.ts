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
export class PlaybooksResource {
  constructor(private client: AlvaClient) {}

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
