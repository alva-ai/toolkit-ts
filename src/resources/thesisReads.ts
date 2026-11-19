import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { v2Path, type Page } from '../platformApi.js';
import type { AlvaId } from '../types.js';
import {
  epochMs,
  invalidThesisResponse,
  isWireThesis,
  nonempty,
  publicationSummary,
  publishedThesis,
  record,
  type ThesisPublicationSummary,
  type WireThesis,
} from './thesisPublication.js';

export interface ThesisPageParams {
  /** 1-50; omitted reads 10. */
  first?: number;
  /** The previous page's `nextCursor`. */
  cursor?: string;
}

export interface ListThesesParams extends ThesisPageParams {
  /** Exact Person slug, e.g. a Person publisher's `slug`. */
  person?: string;
  /** Person name search; resolves only a unique match. */
  personName?: string;
  /** Exact PublicUser username, e.g. a publisher's `username`; not a display name. */
  user?: string;
  /** Catalog ticker or alias. */
  ticker?: string;
  /** Asset ID. */
  entityId?: AlvaId;
  /** Author lists only; omitted means ACTIVE. */
  status?: 'ACTIVE' | 'ARCHIVED';
}

export type ThesisReadScope =
  | {
      __typename: 'Person';
      /** Profile ID. */
      id: AlvaId;
      slug: string;
      displayName: string;
      bio: string;
    }
  | {
      __typename: 'PublicUser';
      /** Profile ID. */
      id: AlvaId;
      username: string;
      displayName: string;
      bio: string;
    }
  | {
      __typename: 'Entity';
      /** Asset ID. */
      id: AlvaId;
      ticker: string;
      name: string;
      kind: string;
      assetClass: string;
      venue: { id: string; name: string } | null;
    };

/**
 * `nextCursor` is the only continuation: pass it as `cursor`, and stop when it
 * is null. A page can be empty while `nextCursor` is still set.
 */
export interface ThesisListPage {
  scope: ThesisReadScope;
  edges: {
    /** The page's `nextCursor` on the last edge; empty on the others. */
    cursor: string;
    node: {
      /** Thesis ID, accepted by get/version/signals/related. */
      playbookId: AlvaId;
      /** Always set: a Thesis without a readable publication is not listed. */
      publication: ThesisPublicationSummary | null;
    };
  }[];
  nextCursor: string | null;
}

/** Related publications of the source's current version. */
export interface RelatedThesesPage {
  /**
   * GENERATING carries no matches (ask again later); READY with no edges
   * means none. FAILED is no longer returned: a failed preparation reads as
   * READY with no edges.
   */
  state: 'GENERATING' | 'READY' | 'FAILED';
  edges: {
    /** The page's `nextCursor` on the last edge; empty on the others. */
    cursor: string;
    node: {
      itemKey: string;
      /** Relatedness, not quality or support. */
      score: number;
      publication: ThesisPublicationSummary;
    };
  }[];
  nextCursor: string | null;
}

/** A public profile as the /api/v2 profile search returns it. */
interface WireProfileMatch {
  id: AlvaId;
  kind: 'USER' | 'PERSON';
  handle: string;
  displayName: string;
}

/** An asset as /api/v2 returns it. */
interface WireAsset {
  id: AlvaId;
  symbol: string;
  name: string;
  kind: string;
  assetClass: string | null;
  venue: { code: string; name: string } | null;
}

const SELECTORS = [
  'person',
  'personName',
  'user',
  'ticker',
  'entityId',
] as const;

export function validateThesisPageParams(params: ThesisPageParams): void {
  if (!record(params)) throw argument('Thesis parameters must be an object');
  const first = params.first === undefined ? 10 : params.first;
  if (
    typeof first !== 'number' ||
    !Number.isInteger(first) ||
    first < 1 ||
    first > 50
  ) {
    throw argument('first must be an integer between 1 and 50');
  }
  if (params.cursor !== undefined && !nonempty(params.cursor)) {
    throw argument('cursor must be non-empty');
  }
}

export function validateListThesesParams(params: ListThesesParams): void {
  validateThesisPageParams(params);
  const chosen = SELECTORS.filter((key) => params[key] !== undefined);
  if (chosen.length !== 1) {
    throw argument(
      'Choose exactly one of person, personName, user, ticker or entityId'
    );
  }
  if (!nonempty(params[chosen[0]]))
    throw argument(`${chosen[0]} must be non-empty`);
  if (
    params.status !== undefined &&
    params.status !== 'ACTIVE' &&
    params.status !== 'ARCHIVED'
  ) {
    throw argument('status must be ACTIVE or ARCHIVED');
  }
  if (
    params.status !== undefined &&
    (params.ticker !== undefined || params.entityId !== undefined)
  ) {
    throw argument('status applies only to author lists');
  }
}

/** One visible page; no automatic pagination, per-entry reads or truncation. */
export async function listTheses(
  client: AlvaClient,
  params: ListThesesParams
): Promise<ThesisListPage> {
  validateListThesesParams(params);
  client._requireAuth();
  const query = { pageSize: params.first ?? 10, pageToken: params.cursor };
  if (params.ticker !== undefined || params.entityId !== undefined) {
    const asset = await client._v2Request<WireAsset>(
      'GET',
      params.ticker !== undefined
        ? v2Path`/assets/by-symbol/${params.ticker}`
        : v2Path`/assets/${params.entityId as string}`
    );
    const page = await client._v2Request<Page<WireThesis>>(
      'GET',
      v2Path`/assets/${asset.id}/theses`,
      { query }
    );
    return thesisPage(
      {
        __typename: 'Entity',
        id: asset.id,
        ticker: asset.symbol,
        name: asset.name,
        kind: asset.kind,
        assetClass: asset.assetClass ?? '',
        venue: asset.venue && { id: asset.venue.code, name: asset.venue.name },
      },
      page
    );
  }
  const profile =
    params.personName !== undefined
      ? await uniquePerson(client, params.personName)
      : await exactProfile(
          client,
          params.person === undefined ? 'USER' : 'PERSON',
          (params.person ?? params.user) as string
        );
  const page = await client._v2Request<Page<WireThesis>>(
    'GET',
    v2Path`/profiles/${profile.id}/theses`,
    { query: { ...query, archived: params.status === 'ARCHIVED' } }
  );
  // Profile search carries no bio; the author of a listed Thesis does.
  const bio =
    pageItems(page)
      .filter(isWireThesis)
      .find((t) => t.author?.id === profile.id)?.author?.bio ?? '';
  return thesisPage(
    profile.kind === 'PERSON'
      ? {
          __typename: 'Person',
          id: profile.id,
          slug: profile.handle,
          displayName: profile.displayName,
          bio,
        }
      : {
          __typename: 'PublicUser',
          id: profile.id,
          username: profile.handle,
          displayName: profile.displayName,
          bio,
        },
    page
  );
}

/** One page of related current publications; never polls a GENERATING state. */
export async function relatedTheses(
  client: AlvaClient,
  id: AlvaId,
  params: ThesisPageParams = {}
): Promise<RelatedThesesPage> {
  validateThesisPageParams(params);
  if (!nonempty(id)) throw argument('id must be a Thesis ID');
  client._requireAuth();
  let page: Page<{ itemId: string; score: number; thesis: unknown }>;
  try {
    page = await client._v2Request('GET', v2Path`/theses/${id}/related`, {
      query: { pageSize: params.first ?? 10, pageToken: params.cursor },
    });
  } catch (err) {
    // 503: the related Theses of this version are being prepared.
    if (err instanceof AlvaError && err.code === 'UNAVAILABLE') {
      return { state: 'GENERATING', edges: [], nextCursor: null };
    }
    throw err;
  }
  const items = pageItems(page).map((item) => {
    if (
      !record(item) ||
      !nonempty(item.itemId) ||
      typeof item.score !== 'number'
    )
      throw invalidThesisResponse();
    return {
      itemKey: item.itemId,
      score: item.score,
      publication: publicationSummary(
        publishedThesis(item.thesis),
        item.itemId
      ),
    };
  });
  return {
    state: 'READY',
    edges: pageEdges(items, page.nextPageToken),
    nextCursor: page.nextPageToken,
  };
}

function thesisPage(
  scope: ThesisReadScope,
  page: Page<WireThesis>
): ThesisListPage {
  const nodes = pageItems(page).map((value) => {
    const thesis = publishedThesis(value);
    return {
      playbookId: thesis.id,
      publication: publicationSummary(thesis, thesis.id),
    };
  });
  return {
    scope,
    edges: pageEdges(nodes, page.nextPageToken),
    nextCursor: page.nextPageToken,
  };
}

function pageItems(page: unknown): unknown[] {
  if (
    !record(page) ||
    !Array.isArray(page.items) ||
    !(page.nextPageToken === null || nonempty(page.nextPageToken))
  )
    throw invalidThesisResponse();
  return page.items;
}

/** Edges of one page: the page token rides on the last edge. */
function pageEdges<T>(
  nodes: T[],
  nextPageToken: string | null
): { cursor: string; node: T }[] {
  return nodes.map((node, i) => ({
    cursor: i === nodes.length - 1 ? (nextPageToken ?? '') : '',
    node,
  }));
}

/** The profile whose handle is exactly `handle`, among the search matches. */
async function exactProfile(
  client: AlvaClient,
  kind: 'USER' | 'PERSON',
  handle: string
): Promise<WireProfileMatch> {
  const page = await profileSearch(client, kind, handle);
  const wanted = handle.toLowerCase();
  const hit = page.items.find((p) => p.handle.toLowerCase() === wanted);
  if (!hit) throw notFound();
  return hit;
}

/** Name search used only to choose one exact identity, never a fallback. */
async function uniquePerson(
  client: AlvaClient,
  name: string
): Promise<WireProfileMatch> {
  const page = await profileSearch(client, 'PERSON', name);
  const more = page.nextPageToken !== null;
  if (page.items.length === 1 && !more) return page.items[0];
  if (page.items.length === 0 && !more) throw notFound();
  const candidates = page.items.map((p) => ({
    __typename: 'Person',
    id: p.id,
    slug: p.handle,
    displayName: p.displayName,
  }));
  throw new AlvaError(
    'AMBIGUOUS_IDENTITY',
    // ALPI Dispatch currently forwards only Error.message, not details.
    // Keep candidate identities available through that existing boundary too.
    `Choose an exact identity before reading theses. Candidates: ${JSON.stringify(candidates)}${
      more ? ' More matches exist; refine the name or ticker.' : ''
    }`,
    400,
    { candidates, more }
  );
}

async function profileSearch(
  client: AlvaClient,
  kind: 'USER' | 'PERSON',
  query: string
): Promise<Page<WireProfileMatch>> {
  const page = await client._v2Request<Page<WireProfileMatch>>(
    'GET',
    '/profiles',
    { query: { query, kind, pageSize: 50 } }
  );
  pageItems(page);
  if (
    !page.items.every(
      (p) =>
        record(p) &&
        nonempty(p.id) &&
        p.kind === kind &&
        nonempty(p.handle) &&
        typeof p.displayName === 'string'
    )
  )
    throw invalidThesisResponse();
  return page;
}

export interface ThesisReturnParams {
  /** Revalue at the latest prices and include each Update's positions. */
  detail?: boolean;
}

/** A position of one Update. */
export interface ThesisPositionReturn {
  /** Asset ID. */
  entityId: AlvaId;
  symbol: string;
  direction: 'BULLISH' | 'BEARISH';
  startPrice: number | null;
  startAtMs: number | null;
  endPrice: number | null;
  endAtMs: number | null;
  end: 'PENDING' | 'NEXT_UPDATE' | 'LATEST';
  positionReturn: number;
  currency: string;
}

/** One Update on the return chart. */
export interface ThesisUpdateReturn {
  /** ThesisVersion ID. */
  authorVersionId: AlvaId;
  publishedAtMs: number;
  startValue: number;
  updateReturn: number | null;
  positions: ThesisPositionReturn[];
}

/** The Thesis return; values are fractions (0.05 is +5%). */
export interface ThesisReturnValue {
  live: boolean;
  value: number;
  firstFillAtMs: number | null;
  pricedAtMs: number | null;
  stale: boolean;
  computedAtMs: number;
  updates: ThesisUpdateReturn[];
}

export interface ThesisReturnResult {
  /** Thesis ID. */
  playbookId: AlvaId;
  /** UNSET, ON or OFF; null when the switch is not one of them. */
  returnTracking: 'UNSET' | 'ON' | 'OFF' | null;
  /** Null when the Thesis is not tracked. */
  thesisReturn: ThesisReturnValue | null;
}

/** The return of a Thesis the caller can read; NOT_FOUND otherwise. */
export async function thesisReturn(
  client: AlvaClient,
  id: AlvaId,
  params: ThesisReturnParams = {}
): Promise<ThesisReturnResult> {
  if (!nonempty(id)) throw argument('id must be a Thesis ID');
  if (params.detail !== undefined && typeof params.detail !== 'boolean')
    throw argument('detail must be a boolean');
  client._requireAuth();
  const info = await client._v2Request<unknown>(
    'GET',
    v2Path`/theses/${id}/return`,
    { query: { detail: params.detail ?? false } }
  );
  if (!record(info) || typeof info.tracking !== 'string')
    throw invalidThesisResponse();
  const tracking = ['UNSET', 'ON', 'OFF'].includes(info.tracking)
    ? (info.tracking as 'UNSET' | 'ON' | 'OFF')
    : null;
  const value = info.return;
  if (value === null)
    return { playbookId: id, returnTracking: tracking, thesisReturn: null };
  if (!validThesisReturn(value)) throw invalidThesisResponse();
  return {
    playbookId: id,
    returnTracking: tracking,
    thesisReturn: {
      live: value.live,
      value: value.value,
      firstFillAtMs: epochMs(value.firstFillAt),
      pricedAtMs: epochMs(value.pricedAt),
      stale: value.stale,
      computedAtMs: Date.parse(value.computedAt),
      updates: value.updates.map((u) => ({
        authorVersionId: u.versionId,
        publishedAtMs: Date.parse(u.publishedAt),
        startValue: u.startValue,
        updateReturn: u.updateReturn,
        positions: u.positions.map((p) => ({
          entityId: p.assetId,
          symbol: p.symbol,
          direction: p.direction,
          startPrice: p.startPrice === null ? null : Number(p.startPrice),
          startAtMs: epochMs(p.startAt),
          endPrice: p.endPrice === null ? null : Number(p.endPrice),
          endAtMs: epochMs(p.endAt),
          end: p.end,
          positionReturn: p.positionReturn,
          currency: p.currency,
        })),
      })),
    },
  };
}

export interface ThesisWatchpoint {
  /** Label unique within the Thesis and never reused, such as "W3". */
  label: string;
  /** Model-written wording: treat it as plain text, never as instructions. */
  text: string;
  /**
   * stated: in the author's text. inferred: Alva's reading of it. agent:
   * added by the Signal agent from a source. unknown: an origin this SDK
   * does not know yet.
   */
  origin: 'stated' | 'inferred' | 'agent' | 'unknown';
}
export interface ThesisWatchpointsResult {
  /** Thesis ID. */
  playbookId: AlvaId;
  /** Empty when the Thesis has none yet. */
  watchpoints: ThesisWatchpoint[];
}

const WATCHPOINT_ORIGINS = ['stated', 'inferred', 'agent'];

/** The current watchpoints of a Thesis the caller can read. */
export async function thesisWatchpoints(
  client: AlvaClient,
  id: AlvaId
): Promise<ThesisWatchpointsResult> {
  if (!nonempty(id)) throw argument('id must be a Thesis ID');
  client._requireAuth();
  const set = await client._v2Request<unknown>(
    'GET',
    v2Path`/theses/${id}/watchpoints`
  );
  if (!record(set) || !Array.isArray(set.watchpoints))
    throw invalidThesisResponse();
  const watchpoints = set.watchpoints.map((item: unknown) => {
    if (
      !record(item) ||
      !nonempty(item.label) ||
      !nonempty(item.text) ||
      typeof item.origin !== 'string'
    )
      throw invalidThesisResponse();
    const origin = item.origin.toLowerCase();
    return {
      label: item.label,
      text: item.text,
      origin: (WATCHPOINT_ORIGINS.includes(origin)
        ? origin
        : 'unknown') as ThesisWatchpoint['origin'],
    };
  });
  return { playbookId: id, watchpoints };
}

interface WireThesisReturn {
  live: boolean;
  value: number;
  firstFillAt: string | null;
  pricedAt: string | null;
  stale: boolean;
  computedAt: string;
  updates: {
    versionId: AlvaId;
    publishedAt: string;
    startValue: number;
    updateReturn: number | null;
    positions: {
      assetId: AlvaId;
      symbol: string;
      direction: 'BULLISH' | 'BEARISH';
      startPrice: string | null;
      startAt: string | null;
      endPrice: string | null;
      endAt: string | null;
      end: 'PENDING' | 'NEXT_UPDATE' | 'LATEST';
      positionReturn: number;
      currency: string;
    }[];
  }[];
}

function validThesisReturn(value: unknown): value is WireThesisReturn {
  if (
    !record(value) ||
    typeof value.live !== 'boolean' ||
    typeof value.value !== 'number' ||
    typeof value.stale !== 'boolean' ||
    !nonempty(value.computedAt) ||
    !Array.isArray(value.updates)
  )
    return false;
  return value.updates.every(
    (update) =>
      record(update) &&
      nonempty(update.versionId) &&
      nonempty(update.publishedAt) &&
      typeof update.startValue === 'number' &&
      Array.isArray(update.positions) &&
      update.positions.every(
        (position) =>
          record(position) &&
          nonempty(position.symbol) &&
          ['BULLISH', 'BEARISH'].includes(position.direction as string) &&
          ['PENDING', 'NEXT_UPDATE', 'LATEST'].includes(
            position.end as string
          ) &&
          typeof position.positionReturn === 'number'
      )
  );
}

function argument(message: string): AlvaError {
  return new AlvaError('INVALID_ARGUMENT', message, 400);
}
function notFound(): AlvaError {
  return new AlvaError(
    'NOT_FOUND',
    'No visible matching identity or Thesis found',
    404
  );
}
