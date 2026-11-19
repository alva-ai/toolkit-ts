import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { v2Path, type Page } from '../platformApi.js';
import type { AlvaId } from '../types.js';

/** Market entity kinds that can be added to the watchlist. */
export type WatchlistTickerKind = 'STOCK' | 'ETF' | 'CRYPTO';

/** Public profile kinds: USER is an Alva user, PERSON a curated person. */
export type FollowProfileKind = 'USER' | 'PERSON';

/** One requested symbol with an optional kind for just that symbol. */
export interface WatchlistTickerSpec {
  ticker: string;
  kind?: WatchlistTickerKind;
}

export interface WatchlistTickersParams {
  /**
   * 1-50 ticker symbols, matched exactly (case-insensitive). A spec's own
   * kind overrides `kind`, so one call can mix kinds (NVDA and BTC:crypto).
   */
  tickers: Array<string | WatchlistTickerSpec>;
  /** Default kind for tickers without their own kind. */
  kind?: WatchlistTickerKind;
}

interface NormalizedTicker {
  ticker: string;
  kind?: WatchlistTickerKind;
}

export interface ResolvedTicker {
  /** The symbol as the caller supplied it, normalized to upper case. */
  input: string;
  /** Asset ID. */
  entityId: AlvaId;
  ticker: string;
  name: string;
  kind: string;
}

export interface UnresolvedTicker {
  input: string;
  /** The kind the lookup was restricted to, when one was given. */
  kind?: WatchlistTickerKind;
  /** NOT_FOUND: no listing of the symbol (of the kind, when one was given). */
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
  /** Asset ID. */
  entityId: AlvaId;
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
  /** Profile ID; it names the kind too. */
  id: AlvaId;
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
  /** Profile ID. */
  id: AlvaId;
  /** @deprecated The Profile ID names the kind; checked when given, otherwise unused. */
  kind?: FollowProfileKind;
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

/**
 * The listing markets a kind-restricted lookup tries, in order: a symbol
 * resolves to one listing per market (ResolveListing), and its Asset carries
 * the kind.
 */
const KIND_ASSET_CLASSES: Record<WatchlistTickerKind, readonly string[]> = {
  STOCK: ['US_STOCK', 'NON_US_STOCK'],
  ETF: ['US_STOCK', 'NON_US_STOCK'],
  CRYPTO: ['BINANCE_SPOT', 'HYPERLIQUID_SPOT', 'BINANCE_PERP'],
};

/** An Asset as /api/v2 social and market routes return it. */
interface WireAsset {
  id: AlvaId;
  symbol: string;
  name: string;
  kind: string;
}

/** A Profile of /api/v2/profiles and /api/v2/me/followed-profiles. */
interface WireProfile {
  id: AlvaId;
  kind: FollowProfileKind;
  displayName: string;
  handle: string;
  xHandle: string | null;
  followerCount: number;
  viewerState: { following: boolean | null };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pageInfo(page: Page<unknown>): FollowPageInfo {
  return {
    endCursor: page.nextPageToken ?? '',
    hasNextPage: Boolean(page.nextPageToken),
  };
}

function profile(p: WireProfile): FollowProfile {
  const base = {
    id: p.id,
    displayName: p.displayName,
    followersCount: p.followerCount,
    following: p.viewerState.following,
  };
  return p.kind === 'USER'
    ? { kind: 'USER', ...base, username: p.handle }
    : { kind: 'PERSON', ...base, slug: p.handle, xHandle: p.xHandle };
}

function resolved(input: string, asset: WireAsset): ResolvedTicker {
  return {
    input,
    entityId: asset.id,
    ticker: asset.symbol,
    name: asset.name,
    kind: asset.kind,
  };
}

/** Runs `task` over `items` with at most LOOKUP_CONCURRENCY at a time, keeping order. */
async function mapConcurrently<T, R>(
  items: readonly T[],
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(LOOKUP_CONCURRENCY, items.length) }, worker)
  );
  return results;
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

function tickerKind(value: unknown): WatchlistTickerKind | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    !TICKER_KINDS.includes(value as WatchlistTickerKind)
  ) {
    throw new Error('kind must be STOCK, ETF, or CRYPTO');
  }
  return value as WatchlistTickerKind;
}

/**
 * Parses one CLI symbol, `NVDA` or `BTC:crypto`, into a ticker spec; the
 * suffix is the kind for that symbol only. Exported for the CLI.
 */
export function parseTickerSpec(raw: string): WatchlistTickerSpec {
  const separator = raw.lastIndexOf(':');
  if (separator === -1) return { ticker: raw };
  return {
    ticker: raw.slice(0, separator),
    kind: tickerKind(
      raw
        .slice(separator + 1)
        .trim()
        .toUpperCase()
    ),
  };
}

/** Normalizes and validates watchlist ticker input; exported for CLI usage errors. */
export function normalizeWatchlistTickersParams(
  params: WatchlistTickersParams
): { tickers: NormalizedTicker[] } {
  if (!record(params) || !Array.isArray(params.tickers)) {
    throw new Error('tickers must be a list of ticker symbols');
  }
  const defaultKind = tickerKind(params.kind);
  const tickers: NormalizedTicker[] = [];
  for (const raw of params.tickers) {
    const spec = typeof raw === 'string' ? { ticker: raw } : raw;
    if (!record(spec) || typeof spec.ticker !== 'string') {
      throw new Error('tickers must be symbols or {ticker, kind} specs');
    }
    const ticker = spec.ticker.trim().toUpperCase();
    if (!ticker || /\s/.test(ticker) || ticker.length > MAX_TICKER_LENGTH) {
      throw new Error(
        `ticker '${spec.ticker}' must be a non-empty symbol of at most ${MAX_TICKER_LENGTH} characters`
      );
    }
    const kind = tickerKind(spec.kind) ?? defaultKind;
    if (!tickers.some((t) => t.ticker === ticker && t.kind === kind)) {
      tickers.push(kind === undefined ? { ticker } : { ticker, kind });
    }
  }
  if (tickers.length === 0 || tickers.length > MAX_TICKERS) {
    throw new Error(
      `tickers must contain between 1 and ${MAX_TICKERS} symbols`
    );
  }
  return { tickers };
}

/** Validates a profile reference; exported for CLI usage errors. */
export function validateProfileRef(params: ProfileRefParams): ProfileRefParams {
  if (!record(params)) throw new Error('profile reference must be an object');
  const kind = profileKind(params.kind, false);
  if (typeof params.id !== 'string' || !params.id.trim()) {
    throw new Error('id must be a profile id');
  }
  return kind === undefined ? { id: params.id } : { id: params.id, kind };
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

/**
 * A kind-restricted miss names the kind: the symbol may exist under another
 * kind (BTC as STOCK vs CRYPTO), so "not found" alone would mislead.
 */
function unresolvedTicker(
  input: string,
  kind: WatchlistTickerKind | undefined,
  code: string,
  message: string
): TickerLookup {
  if (kind === undefined) {
    return { ok: false, unresolved: { input, code, message } };
  }
  return {
    ok: false,
    unresolved: {
      input,
      kind,
      code,
      message:
        code === 'NOT_FOUND'
          ? `no ${kind} entity found for ticker ${input}; it may exist as another kind (retry with a different :kind suffix or none)`
          : message,
    },
  };
}

type TickerLookup =
  | { ok: true; ticker: ResolvedTicker }
  | { ok: false; unresolved: UnresolvedTicker };

/**
 * The Alva App's ticker watchlist (add/remove) and people follows (Alva users
 * and curated people). Gateway stores watchlist entries as Asset follows.
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

  /**
   * Remove tickers from the watchlist by exact symbol, one Asset at a time:
   * when one removal fails, the earlier ones stand.
   */
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
    const [page, counts] = await Promise.all([
      this.client._v2Request<Page<WireAsset & { followedAt: string | null }>>(
        'GET',
        '/me/followed-assets',
        { query: { pageSize: first ?? 20, pageToken: after } }
      ),
      this.client._v2Request<{ assetCount: number }>(
        'GET',
        '/me/follow-counts'
      ),
    ]);
    return {
      totalCount: counts.assetCount,
      tickers: page.items.map((a) => ({
        entityId: a.id,
        ticker: a.symbol,
        name: a.name,
        kind: a.kind,
        addedAtMs: a.followedAt ? Date.parse(a.followedAt) : 0,
      })),
      pageInfo: pageInfo(page),
    };
  }

  /** Search public profiles (Alva users and curated people). */
  async searchProfiles(params: SearchProfilesParams): Promise<ProfilesPage> {
    const { query, kind, first } = validateSearchProfilesParams(params);
    this.client._requireAuth();
    return this.profilesPage(
      await this.client._v2Request<Page<WireProfile>>('GET', '/profiles', {
        query: { query, kind, pageSize: first ?? 10 },
      })
    );
  }

  /** One page of profiles the caller follows. */
  async profiles(params: FollowedProfilesParams = {}): Promise<ProfilesPage> {
    const kind = profileKind(params.kind, false);
    const first = boundedFirst(params.first, MAX_PROFILE_FIRST);
    const after = optionalCursor(params.after);
    this.client._requireAuth();
    return this.profilesPage(
      await this.client._v2Request<Page<WireProfile>>(
        'GET',
        '/me/followed-profiles',
        { query: { kind, pageSize: first ?? 20, pageToken: after } }
      )
    );
  }

  /** Follow one profile. Idempotent. */
  async followProfile(params: ProfileRefParams): Promise<ProfileFollowResult> {
    const { id } = validateProfileRef(params);
    this.client._requireAuth();
    return this.profileFollow(
      await this.client._v2Request<ProfileFollow>(
        'POST',
        '/me/followed-profiles',
        { body: { profileId: id } }
      )
    );
  }

  /** Unfollow one profile. Idempotent. */
  async unfollowProfile(
    params: ProfileRefParams
  ): Promise<ProfileFollowResult> {
    const { id } = validateProfileRef(params);
    this.client._requireAuth();
    return this.profileFollow(
      await this.client._v2Request<ProfileFollow>(
        'DELETE',
        v2Path`/me/followed-profiles/${id}`
      )
    );
  }

  private profilesPage(page: Page<WireProfile>): ProfilesPage {
    return { profiles: page.items.map(profile), pageInfo: pageInfo(page) };
  }

  private profileFollow(result: ProfileFollow): ProfileFollowResult {
    return {
      following: result.following,
      profile: result.profile ? profile(result.profile) : null,
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
    const { tickers } = normalizeWatchlistTickersParams(params);
    this.client._requireAuth();
    const lookups = await mapConcurrently(tickers, ({ ticker, kind }) =>
      this.lookupTicker(ticker, kind)
    );
    // Two inputs (e.g. BRK.B and BRK-B) can name one Asset: write it once
    // and report every input with that Asset's outcome.
    const assetIds = [
      ...new Set(lookups.flatMap((l) => (l.ok ? [l.ticker.entityId] : []))),
    ];
    const changedAssets = new Set<AlvaId>();
    if (direction === 'add' && assetIds.length > 0) {
      const result = await this.client._v2Request<{
        assets: { asset: WireAsset; changed: boolean }[];
      }>('POST', '/me/followed-assets', { body: { assetIds } });
      for (const a of result.assets)
        if (a.changed) changedAssets.add(a.asset.id);
    }
    if (direction === 'remove') {
      // A removal is also recorded for tickers not in the watchlist: the
      // Backend then keeps holdings sync from adding them later.
      const results = await mapConcurrently(assetIds, (id) =>
        this.client._v2Request<{ changed: boolean }>(
          'DELETE',
          v2Path`/me/followed-assets/${id}`
        )
      );
      results.forEach((r, i) => r.changed && changedAssets.add(assetIds[i]));
    }
    const changed: ResolvedTicker[] = [];
    const unchanged: ResolvedTicker[] = [];
    const unresolved: UnresolvedTicker[] = [];
    for (const lookup of lookups) {
      if (!lookup.ok) unresolved.push(lookup.unresolved);
      else if (changedAssets.has(lookup.ticker.entityId))
        changed.push(lookup.ticker);
      else unchanged.push(lookup.ticker);
    }
    return { changed, unchanged, unresolved };
  }

  /**
   * The Asset a symbol names: its primary listing, or with a kind the first
   * listing of that kind in the kind's markets.
   */
  private async lookupTicker(
    input: string,
    kind: WatchlistTickerKind | undefined
  ): Promise<TickerLookup> {
    for (const assetClass of kind ? KIND_ASSET_CLASSES[kind] : [undefined]) {
      let asset: WireAsset;
      try {
        asset = await this.client._v2Request<WireAsset>(
          'GET',
          v2Path`/assets/by-symbol/${input}`,
          { query: { assetClass } }
        );
      } catch (error) {
        if (error instanceof AlvaError && error.code === 'NOT_FOUND') continue;
        throw error;
      }
      if (kind === undefined || asset.kind === kind) {
        return { ok: true, ticker: resolved(input, asset) };
      }
    }
    return unresolvedTicker(
      input,
      kind,
      'NOT_FOUND',
      `no entity found for ticker: ${input}`
    );
  }
}

/** POST and DELETE /api/v2/me/followed-profiles. */
interface ProfileFollow {
  following: boolean;
  profile: WireProfile | null;
}
