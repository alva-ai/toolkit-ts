import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';

/** Market entity kinds that can be added to the watchlist. */
export type WatchlistTickerKind = 'STOCK' | 'ETF' | 'CRYPTO';

/** Public profile kinds: USER is an Alva user, PERSON a curated person. */
export type FollowProfileKind = 'USER' | 'PERSON';

export interface WatchlistTickersParams {
  /** 1-50 ticker symbols, matched exactly (case-insensitive). */
  tickers: string[];
  /** Optional kind applied to every ticker to disambiguate a symbol. */
  kind?: WatchlistTickerKind;
}

export interface ResolvedTicker {
  /** The symbol as the caller supplied it, normalized to upper case. */
  input: string;
  entityId: string;
  ticker: string;
  name: string;
  kind: string;
}

export interface UnresolvedTicker {
  input: string;
  /** NOT_FOUND or FAILED_PRECONDITION (several entities share the symbol). */
  code: string;
  message: string;
}

export interface AddToWatchlistResult {
  /** Tickers newly added to the watchlist by this call. */
  added: ResolvedTicker[];
  /** Tickers already in the watchlist; nothing was written for them. */
  unchanged: ResolvedTicker[];
  unresolved: UnresolvedTicker[];
}

export interface RemoveFromWatchlistResult {
  /** Tickers removed from the watchlist by this call. */
  removed: ResolvedTicker[];
  /**
   * Tickers that were not in the watchlist. The removal is still recorded, so
   * holdings sync will not add them later.
   */
  unchanged: ResolvedTicker[];
  unresolved: UnresolvedTicker[];
}

export interface FollowPageParams {
  first?: number;
  after?: string;
}

export interface FollowPageInfo {
  endCursor: string;
  hasNextPage: boolean;
}

export interface WatchlistTicker {
  entityId: string;
  ticker: string;
  name: string;
  kind: string;
  addedAtMs: number;
}

export interface WatchlistPage {
  totalCount: number;
  tickers: WatchlistTicker[];
  pageInfo: FollowPageInfo;
}

export interface FollowProfile {
  kind: FollowProfileKind;
  id: string;
  displayName: string;
  /** Alva username; USER profiles only. */
  username?: string;
  /** URL slug; PERSON profiles only. */
  slug?: string;
  /** X handle without "@"; PERSON profiles only, null when absent. */
  xHandle?: string | null;
  followersCount: number;
  /** Whether the caller follows this profile; null when unknown. */
  following: boolean | null;
}

export interface SearchProfilesParams {
  query: string;
  kind?: FollowProfileKind;
  first?: number;
}

export interface ProfileRefParams {
  kind: FollowProfileKind;
  id: string;
}

export interface FollowedProfilesParams extends FollowPageParams {
  kind?: FollowProfileKind;
}

export interface ProfilesPage {
  profiles: FollowProfile[];
  pageInfo: FollowPageInfo;
}

export interface ProfileFollowResult {
  following: boolean;
  profile: FollowProfile | null;
}

const MAX_TICKERS = 50;
const MAX_TICKER_LENGTH = 40;
const MAX_WATCHLIST_FIRST = 100;
const MAX_PROFILE_FIRST = 50;
const MAX_PROFILE_QUERY_LENGTH = 200;
const LOOKUP_CONCURRENCY = 5;
const TICKER_KINDS: readonly WatchlistTickerKind[] = ['STOCK', 'ETF', 'CRYPTO'];
const PROFILE_KINDS: readonly FollowProfileKind[] = ['USER', 'PERSON'];
/** Lookup outcomes reported per ticker instead of failing the command. */
const UNRESOLVED_LOOKUP_CODES = new Set(['NOT_FOUND', 'FAILED_PRECONDITION']);

const GRAPHQL_STATUS_BY_CODE: Readonly<Record<string, number>> = {
  INVALID_ARGUMENT: 400,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  ABORTED: 409,
  FAILED_PRECONDITION: 412,
  RESOURCE_EXHAUSTED: 429,
  INTERNAL: 500,
  UNKNOWN: 500,
  DATA_LOSS: 500,
  UNAVAILABLE: 503,
  DEADLINE_EXCEEDED: 504,
};

const TICKER_FIELDS = 'id ticker name kind';
const PROFILE_FIELDS =
  '__typename id displayName followersCount viewerState { following } ... on PublicUser { username } ... on Person { slug xHandle }';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidResponse(field: string): never {
  throw new AlvaError(
    'GRAPHQL_INVALID_RESPONSE',
    `GraphQL returned an invalid ${field} response`,
    502
  );
}

interface GraphQLFailure {
  code: string;
  message: string;
  errors: unknown[];
}

/** Returns the canonical failure when every error shares one known code. */
function graphQLFailure(response: unknown): GraphQLFailure | undefined {
  if (!record(response) || response.errors === undefined) return undefined;
  if (!Array.isArray(response.errors)) return invalidResponse('GraphQL');
  if (response.errors.length === 0) return undefined;
  const errors = response.errors;
  const messages = errors.flatMap((error: unknown) =>
    record(error) && typeof error.message === 'string' ? [error.message] : []
  );
  const codes = errors.map((error: unknown) =>
    record(error) && record(error.extensions)
      ? error.extensions.code
      : undefined
  );
  const code =
    typeof codes[0] === 'string' &&
    Object.hasOwn(GRAPHQL_STATUS_BY_CODE, codes[0]) &&
    codes.every((value) => value === codes[0])
      ? codes[0]
      : 'GRAPHQL_ERROR';
  return { code, message: messages.join('; ') || 'Request failed', errors };
}

function throwFailure(failure: GraphQLFailure): never {
  throw new AlvaError(
    failure.code,
    failure.message,
    GRAPHQL_STATUS_BY_CODE[failure.code] ?? 502,
    { errors: failure.errors }
  );
}

function responseData(
  response: unknown,
  field: string
): Record<string, unknown> {
  const failure = graphQLFailure(response);
  if (failure) throwFailure(failure);
  if (!record(response) || !record(response.data))
    return invalidResponse(field);
  return response.data;
}

function viewerField(response: unknown, field: string): unknown {
  const data = responseData(response, field);
  if (!record(data.viewer)) return invalidResponse(field);
  return data.viewer[field];
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) return invalidResponse(field);
  return value;
}

function pageInfo(value: unknown, field: string): FollowPageInfo {
  if (
    !record(value) ||
    typeof value.hasNextPage !== 'boolean' ||
    (value.endCursor !== null &&
      value.endCursor !== undefined &&
      typeof value.endCursor !== 'string') ||
    (value.hasNextPage && !value.endCursor)
  ) {
    return invalidResponse(field);
  }
  return {
    endCursor: typeof value.endCursor === 'string' ? value.endCursor : '',
    hasNextPage: value.hasNextPage,
  };
}

function normalizeProfile(value: unknown, field: string): FollowProfile {
  if (!record(value) || !record(value.viewerState))
    return invalidResponse(field);
  const following = value.viewerState.following;
  if (
    typeof value.followersCount !== 'number' ||
    typeof value.displayName !== 'string' ||
    (following !== null && typeof following !== 'boolean')
  ) {
    return invalidResponse(field);
  }
  const base = {
    id: requireString(value.id, field),
    displayName: value.displayName,
    followersCount: value.followersCount,
    following: following ?? null,
  };
  if (value.__typename === 'PublicUser') {
    return {
      kind: 'USER',
      ...base,
      username: requireString(value.username, field),
    };
  }
  if (value.__typename === 'Person') {
    if (value.xHandle !== null && typeof value.xHandle !== 'string') {
      return invalidResponse(field);
    }
    return {
      kind: 'PERSON',
      ...base,
      slug: requireString(value.slug, field),
      xHandle: value.xHandle ?? null,
    };
  }
  return invalidResponse(field);
}

function boundedFirst(value: number | undefined, max: number, name = 'first') {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}`);
  }
  return value;
}

function optionalCursor(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) {
    throw new Error(
      'after must be a non-empty cursor of at most 4096 characters'
    );
  }
  return value;
}

function profileKind(value: unknown, required: true): FollowProfileKind;
function profileKind(
  value: unknown,
  required: false
): FollowProfileKind | undefined;
function profileKind(value: unknown, required: boolean) {
  if (value === undefined && !required) return undefined;
  if (
    typeof value !== 'string' ||
    !PROFILE_KINDS.includes(value as FollowProfileKind)
  ) {
    throw new Error('kind must be USER or PERSON');
  }
  return value as FollowProfileKind;
}

/** Normalizes and validates watchlist ticker input; exported for CLI usage errors. */
export function normalizeWatchlistTickersParams(
  params: WatchlistTickersParams
): {
  tickers: string[];
  kind?: WatchlistTickerKind;
} {
  if (!record(params) || !Array.isArray(params.tickers)) {
    throw new Error('tickers must be a list of ticker symbols');
  }
  const tickers: string[] = [];
  for (const raw of params.tickers) {
    if (typeof raw !== 'string') throw new Error('tickers must be strings');
    const ticker = raw.trim().toUpperCase();
    if (!ticker || /\s/.test(ticker) || ticker.length > MAX_TICKER_LENGTH) {
      throw new Error(
        `ticker '${raw}' must be a non-empty symbol of at most ${MAX_TICKER_LENGTH} characters`
      );
    }
    if (!tickers.includes(ticker)) tickers.push(ticker);
  }
  if (tickers.length === 0 || tickers.length > MAX_TICKERS) {
    throw new Error(
      `tickers must contain between 1 and ${MAX_TICKERS} symbols`
    );
  }
  if (params.kind !== undefined && !TICKER_KINDS.includes(params.kind)) {
    throw new Error('kind must be STOCK, ETF, or CRYPTO');
  }
  return params.kind === undefined
    ? { tickers }
    : { tickers, kind: params.kind };
}

/** Validates a profile reference; exported for CLI usage errors. */
export function validateProfileRef(params: ProfileRefParams): ProfileRefParams {
  if (!record(params)) throw new Error('profile reference must be an object');
  const kind = profileKind(params.kind, true);
  if (typeof params.id !== 'string' || !/^[1-9]\d{0,18}$/.test(params.id)) {
    throw new Error('id must be a positive decimal profile id');
  }
  return { kind, id: params.id };
}

/** Validates profile search input; exported for CLI usage errors. */
export function validateSearchProfilesParams(
  params: SearchProfilesParams
): SearchProfilesParams {
  if (!record(params) || typeof params.query !== 'string') {
    throw new Error('query is required');
  }
  const query = params.query.trim();
  if (!query || query.length > MAX_PROFILE_QUERY_LENGTH) {
    throw new Error(
      `query must be non-empty and at most ${MAX_PROFILE_QUERY_LENGTH} characters`
    );
  }
  return {
    query,
    kind: profileKind(params.kind, false),
    first: boundedFirst(params.first, MAX_PROFILE_FIRST),
  };
}

type TickerLookup =
  | { ok: true; ticker: ResolvedTicker; inWatchlist: boolean }
  | { ok: false; unresolved: UnresolvedTicker };

/**
 * The Alva App's ticker watchlist (add/remove) and people follows (Alva users
 * and curated people). Gateway stores watchlist entries as ticker follows.
 * Playbook follows stay in `client.subscriptions`; Thesis bookmarks are
 * Thesis star/unstar. The user always comes from the API key; there is no
 * identity override.
 */
export class FollowsResource {
  constructor(private client: AlvaClient) {}

  /** Add tickers to the watchlist by exact symbol in one atomic batch. */
  async addToWatchlist(
    params: WatchlistTickersParams
  ): Promise<AddToWatchlistResult> {
    const { changed, unchanged, unresolved } = await this.changeWatchlist(
      params,
      'add'
    );
    return { added: changed, unchanged, unresolved };
  }

  /** Remove tickers from the watchlist by exact symbol in one atomic batch. */
  async removeFromWatchlist(
    params: WatchlistTickersParams
  ): Promise<RemoveFromWatchlistResult> {
    const { changed, unchanged, unresolved } = await this.changeWatchlist(
      params,
      'remove'
    );
    return { removed: changed, unchanged, unresolved };
  }

  /** One page of the watchlist, most recently added first. */
  async watchlist(params: FollowPageParams = {}): Promise<WatchlistPage> {
    const first = boundedFirst(params.first, MAX_WATCHLIST_FIRST);
    const after = optionalCursor(params.after);
    this.client._requireAuth();
    const response = await this.client._request('POST', '/query', {
      body: {
        query: `query ToolkitWatchlist($input: MarketWatchlistConnectionInput) { viewer { marketWatchlist(input: $input) { totalCount edges { cursor followedAtMs node { ${TICKER_FIELDS} } } pageInfo { endCursor hasNextPage } } } }`,
        variables: { input: { first: first ?? 20, after } },
      },
    });
    const field = 'viewer.marketWatchlist';
    const value = viewerField(response, 'marketWatchlist');
    if (
      !record(value) ||
      typeof value.totalCount !== 'number' ||
      !Array.isArray(value.edges)
    ) {
      return invalidResponse(field);
    }
    const tickers = value.edges.map((edge: unknown) => {
      if (
        !record(edge) ||
        !record(edge.node) ||
        typeof edge.followedAtMs !== 'number'
      ) {
        return invalidResponse(field);
      }
      return {
        entityId: requireString(edge.node.id, field),
        ticker: requireString(edge.node.ticker, field),
        name: typeof edge.node.name === 'string' ? edge.node.name : '',
        kind: requireString(edge.node.kind, field),
        addedAtMs: edge.followedAtMs,
      };
    });
    return {
      totalCount: value.totalCount,
      tickers,
      pageInfo: pageInfo(value.pageInfo, field),
    };
  }

  /** Search public profiles (Alva users and curated people). */
  async searchProfiles(params: SearchProfilesParams): Promise<ProfilesPage> {
    const { query, kind, first } = validateSearchProfilesParams(params);
    this.client._requireAuth();
    const response = await this.client._request('POST', '/query', {
      body: {
        query: `query ToolkitSearchProfiles($input: PublicProfileConnectionInput) { profiles(input: $input) { edges { node { ${PROFILE_FIELDS} } } pageInfo { endCursor hasNextPage } } }`,
        variables: { input: { query, kind, first: first ?? 10 } },
      },
    });
    return this.profilesPage(
      responseData(response, 'profiles').profiles,
      'profiles'
    );
  }

  /** One page of profiles the caller follows. */
  async profiles(params: FollowedProfilesParams = {}): Promise<ProfilesPage> {
    const kind = profileKind(params.kind, false);
    const first = boundedFirst(params.first, MAX_PROFILE_FIRST);
    const after = optionalCursor(params.after);
    this.client._requireAuth();
    const response = await this.client._request('POST', '/query', {
      body: {
        query: `query ToolkitFollowedProfiles($input: FollowingProfileConnectionInput) { viewer { followingProfiles(input: $input) { edges { node { ${PROFILE_FIELDS} } } pageInfo { endCursor hasNextPage } } } }`,
        variables: { input: { kind, first: first ?? 20, after } },
      },
    });
    return this.profilesPage(
      viewerField(response, 'followingProfiles'),
      'viewer.followingProfiles'
    );
  }

  /** Follow one profile. Idempotent. */
  async followProfile(params: ProfileRefParams): Promise<ProfileFollowResult> {
    return this.changeProfile(params, 'followProfile');
  }

  /** Unfollow one profile. Idempotent. */
  async unfollowProfile(
    params: ProfileRefParams
  ): Promise<ProfileFollowResult> {
    return this.changeProfile(params, 'unfollowProfile');
  }

  private profilesPage(value: unknown, field: string): ProfilesPage {
    if (!record(value) || !Array.isArray(value.edges)) {
      return invalidResponse(field);
    }
    return {
      profiles: value.edges.map((edge: unknown) =>
        record(edge)
          ? normalizeProfile(edge.node, field)
          : invalidResponse(field)
      ),
      pageInfo: pageInfo(value.pageInfo, field),
    };
  }

  private async changeProfile(
    params: ProfileRefParams,
    mutation: 'followProfile' | 'unfollowProfile'
  ): Promise<ProfileFollowResult> {
    const input = validateProfileRef(params);
    this.client._requireAuth();
    const response = await this.client._request('POST', '/query', {
      body: {
        query: `mutation ToolkitChangeProfileFollow($input: PublicProfileRefInput!) { ${mutation}(input: $input) { following target { ${PROFILE_FIELDS} } } }`,
        variables: { input },
      },
    });
    const value = responseData(response, mutation)[mutation];
    if (!record(value) || typeof value.following !== 'boolean') {
      return invalidResponse(mutation);
    }
    return {
      following: value.following,
      profile:
        value.target === null || value.target === undefined
          ? null
          : normalizeProfile(value.target, mutation),
    };
  }

  private async changeWatchlist(
    params: WatchlistTickersParams,
    direction: 'add' | 'remove'
  ): Promise<{
    changed: ResolvedTicker[];
    unchanged: ResolvedTicker[];
    unresolved: UnresolvedTicker[];
  }> {
    const { tickers, kind } = normalizeWatchlistTickersParams(params);
    this.client._requireAuth();
    const lookups = await this.lookupTickers(tickers, kind);
    const changed: ResolvedTicker[] = [];
    const unchanged: ResolvedTicker[] = [];
    const unresolved: UnresolvedTicker[] = [];
    const seen = new Set<string>();
    const writeIds: string[] = [];
    for (const lookup of lookups) {
      if (!lookup.ok) {
        unresolved.push(lookup.unresolved);
        continue;
      }
      // Two inputs (e.g. BRK.B and BRK-B) can name one entity; write it once.
      if (seen.has(lookup.ticker.entityId)) {
        unchanged.push(lookup.ticker);
        continue;
      }
      seen.add(lookup.ticker.entityId);
      const needsChange =
        direction === 'add' ? !lookup.inWatchlist : lookup.inWatchlist;
      (needsChange ? changed : unchanged).push(lookup.ticker);
      // A removal is also recorded for tickers not in the watchlist: the
      // Backend then keeps holdings sync from adding them later.
      if (needsChange || direction === 'remove') {
        writeIds.push(lookup.ticker.entityId);
      }
    }
    if (writeIds.length > 0) {
      const mutation =
        direction === 'add' ? 'followTickers' : 'unfollowTickers';
      const input =
        direction === 'add' ? 'FollowTickersInput' : 'UnfollowTickersInput';
      const response = await this.client._request('POST', '/query', {
        body: {
          query: `mutation ToolkitChangeWatchlist($input: ${input}!) { ${mutation}(input: $input) { entities { id } } }`,
          variables: { input: { entityIds: writeIds } },
        },
      });
      const value = responseData(response, mutation)[mutation];
      if (!record(value) || !Array.isArray(value.entities)) {
        return invalidResponse(mutation);
      }
    }
    return { changed, unchanged, unresolved };
  }

  private async lookupTickers(
    tickers: string[],
    kind: WatchlistTickerKind | undefined
  ): Promise<TickerLookup[]> {
    const results: TickerLookup[] = new Array(tickers.length);
    let next = 0;
    const worker = async () => {
      while (next < tickers.length) {
        const index = next++;
        results[index] = await this.lookupTicker(tickers[index], kind);
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(LOOKUP_CONCURRENCY, tickers.length) },
        worker
      )
    );
    return results;
  }

  private async lookupTicker(
    input: string,
    kind: WatchlistTickerKind | undefined
  ): Promise<TickerLookup> {
    const response = await this.client._request('POST', '/query', {
      body: {
        query: `query ToolkitTickerLookup($input: MarketEntityLookupInput!) { market { entity(input: $input) { ${TICKER_FIELDS} viewerState { isFollowed } } } }`,
        variables: { input: { ticker: input, kind } },
      },
    });
    const failure = graphQLFailure(response);
    if (failure) {
      if (UNRESOLVED_LOOKUP_CODES.has(failure.code)) {
        return {
          ok: false,
          unresolved: { input, code: failure.code, message: failure.message },
        };
      }
      throwFailure(failure);
    }
    const field = 'market.entity';
    if (
      !record(response) ||
      !record(response.data) ||
      !record(response.data.market)
    ) {
      return invalidResponse(field);
    }
    const entity = response.data.market.entity;
    if (entity === null || entity === undefined) {
      return {
        ok: false,
        unresolved: {
          input,
          code: 'NOT_FOUND',
          message: `no entity found for ticker: ${input}`,
        },
      };
    }
    if (!record(entity)) return invalidResponse(field);
    const viewerState = entity.viewerState;
    // Gateway returns null when this credential cannot see the user's
    // watchlist (playbook-scoped viewer, group guest); never read it as absent.
    if (viewerState === null || viewerState === undefined) {
      throw new AlvaError(
        'PERMISSION_DENIED',
        "This credential cannot read the user's watchlist",
        403
      );
    }
    if (!record(viewerState) || typeof viewerState.isFollowed !== 'boolean') {
      return invalidResponse(field);
    }
    return {
      ok: true,
      inWatchlist: viewerState.isFollowed,
      ticker: {
        input,
        entityId: requireString(entity.id, field),
        ticker: requireString(entity.ticker, field),
        name: typeof entity.name === 'string' ? entity.name : '',
        kind: requireString(entity.kind, field),
      },
    };
  }
}
