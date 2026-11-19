import type { AlvaClient } from '../client.js';
import type { Page } from '../platformApi.js';
import type { AlvaId } from '../types.js';
import {
  epochMs,
  invalidThesisResponse,
  nonempty,
  publicationSummary,
  publishedThesis,
  record,
  type ThesisPublicationSummary,
} from './thesisPublication.js';

export type {
  ThesisPublicationSummary,
  ThesisPublisher,
  ThesisSourceReference,
} from './thesisPublication.js';

export interface ForYouListParams {
  first?: number;
  after?: string;
  /** Not served by /api/v2: passing it is INVALID_ARGUMENT. Re-read the first page instead. */
  newerThan?: string;
  /** Automation ID of one feed in the caller's For You. */
  feedId?: AlvaId;
}

/** The immutable publication selection, not the full mutable Feed object. */
export interface ForYouEntry {
  /** Feed post or Signal ID. */
  id: AlvaId;
  /** Automation ID of the feed. */
  feed: { id: AlvaId };
  /** `id` is empty: a major has no ID of its own. */
  major: { id: string; feedId: AlvaId; number: number };
  displayName: string | null;
  source: string;
  eventTimeMs: number;
  publishedAtMs: number;
  title: string;
  body: string;
  actions: {
    type:
      | 'OPEN_URL'
      | 'SEND_PROMPT'
      | 'CONNECT_PORTFOLIO'
      | 'CONNECT_IM'
      | 'UNKNOWN';
    label: string;
    url: string | null;
    prompt: string | null;
  }[];
  presentation: {
    card: {
      accentColor: string | null;
      url: string | null;
      thumbnailUrl: string | null;
      footer: string | null;
      fields: { label: string; value: string; inline: boolean }[];
    } | null;
  } | null;
  /** `logoUrl` is empty and `sentiment` null: /api/v2 entries carry the symbol only. */
  tickers: {
    symbol: string;
    logoUrl: string;
    sentiment: 'BULLISH' | 'BEARISH' | 'ANOMALY' | null;
  }[];
  media: {
    type: 'PRICE_CHART' | 'IMAGE' | 'AUDIO' | 'VIDEO';
    coverUrl: string;
    url: string | null;
  }[];
  sources: {
    type:
      | 'NEWS'
      | 'X'
      | 'REDDIT'
      | 'YOUTUBE'
      | 'PODCAST'
      | 'EARNINGS'
      | 'FILING'
      | 'WEB'
      | 'MARKET_DATA'
      | 'UNKNOWN';
    url: string | null;
    iconUrl: string | null;
    title: string;
    subtitle: string | null;
    description: string | null;
    publishedAtMs: number;
  }[];
}

export interface ForYouConnection {
  /** The page's `pageInfo.endCursor` rides on the last edge; the others are empty. */
  edges: { cursor: string; node: ForYouEntry }[];
  pageInfo: {
    startCursor: string;
    endCursor: string;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/** Shared by the SDK and CLI so invalid windows never become unbounded reads. */
export function validateForYouListParams(params: ForYouListParams): void {
  if (!record(params)) throw new Error('For You parameters must be an object');
  const first = params.first === undefined ? 20 : params.first;
  if (
    typeof first !== 'number' ||
    !Number.isInteger(first) ||
    first < 1 ||
    first > 50
  ) {
    throw new Error('first must be an integer between 1 and 50');
  }
  for (const field of ['after', 'newerThan'] as const) {
    const value = params[field];
    if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
      throw new Error(`${field} must be a non-empty cursor`);
    }
  }
  if (params.newerThan !== undefined) {
    throw new Error(
      'newerThan is not supported; read the first page again instead'
    );
  }
  if (params.feedId !== undefined && !nonempty(params.feedId)) {
    throw new Error('feedId must be a feed (Automation) ID');
  }
}

/** A For You feed entry as /api/v2 returns it. */
interface WireFeedEntry {
  id: AlvaId;
  automationId: AlvaId;
  majorVersion: number;
  displayName: string | null;
  source: string;
  eventAt: string | null;
  publishedAt: string;
  title: string;
  body: string;
  actions: ForYouEntry['actions'];
  card: NonNullable<ForYouEntry['presentation']>['card'];
  tickers: { symbol: string }[];
  media: ForYouEntry['media'];
  sources: (Omit<ForYouEntry['sources'][number], 'publishedAtMs'> & {
    publishedAt: string | null;
  })[];
}

function forYouEntry(value: unknown): ForYouEntry {
  if (
    !record(value) ||
    !nonempty(value.id) ||
    !nonempty(value.automationId) ||
    typeof value.majorVersion !== 'number' ||
    !nonempty(value.publishedAt) ||
    typeof value.title !== 'string' ||
    typeof value.body !== 'string' ||
    !Array.isArray(value.actions) ||
    !Array.isArray(value.tickers) ||
    !Array.isArray(value.media) ||
    !Array.isArray(value.sources)
  ) {
    throw invalidThesisResponse();
  }
  const e = value as unknown as WireFeedEntry;
  const publishedAtMs = Date.parse(e.publishedAt);
  return {
    id: e.id,
    feed: { id: e.automationId },
    major: { id: '', feedId: e.automationId, number: e.majorVersion },
    displayName: e.displayName,
    source: e.source,
    // An entry without an event time read 0, as the backend stores it.
    eventTimeMs: epochMs(e.eventAt) ?? 0,
    publishedAtMs,
    title: e.title,
    body: e.body,
    actions: e.actions,
    presentation: e.card ? { card: e.card } : null,
    tickers: e.tickers.map((t) => ({
      symbol: t.symbol,
      logoUrl: '',
      sentiment: null,
    })),
    media: e.media,
    sources: e.sources.map(({ publishedAt, ...source }) => ({
      ...source,
      publishedAtMs: epochMs(publishedAt) ?? 0,
    })),
  };
}

export interface ForYouThesesParams {
  first?: number;
  after?: string;
}

export interface ThesisRecommendation {
  itemKey: string;
  publication: ThesisPublicationSummary;
}

/**
 * A ranked page, not a chronological one. `exhausted` is the only end of the
 * candidate pool. A page may be empty while `hasNextPage` is still true,
 * because the list advances past scanned references that current visibility
 * hides. A `CONFLICT` error means the list behind `after` expired: start
 * again without it.
 */
export interface ThesisRecommendationPage {
  /** The page's `nextCursor` rides on the last edge; the others are empty. */
  edges: { cursor: string; node: ThesisRecommendation }[];
  pageInfo: {
    /** The cursor this page was read with; empty for the first page. */
    startCursor: string;
    endCursor: string;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  /** @deprecated Always empty: /api/v2 has no list ID. */
  listId: string;
  /** The cursor this page was read with; empty for the first page. */
  pageCursor: string;
  nextCursor: string | null;
  exhausted: boolean;
  /** @deprecated Always false: /api/v2 does not report a scan budget. */
  scanLimited: boolean;
}

/** Shared by the SDK and CLI. Gateway caps the page at 10; reject earlier. */
export function validateForYouThesesParams(params: ForYouThesesParams): void {
  if (!record(params)) throw new Error('Thesis parameters must be an object');
  const first = params.first === undefined ? 10 : params.first;
  if (
    typeof first !== 'number' ||
    !Number.isInteger(first) ||
    first < 1 ||
    first > 10
  ) {
    throw new Error('first must be an integer between 1 and 10');
  }
  if (
    params.after !== undefined &&
    (typeof params.after !== 'string' || !params.after.trim())
  ) {
    throw new Error('after must be a non-empty cursor');
  }
}

/** Checks a page and returns its items with the page token on the last edge. */
function edges<T>(
  page: unknown,
  map: (item: unknown) => T
): { edges: { cursor: string; node: T }[]; next: string | null } {
  if (
    !record(page) ||
    !Array.isArray(page.items) ||
    !(page.nextPageToken === null || nonempty(page.nextPageToken))
  ) {
    throw invalidThesisResponse();
  }
  const next = page.nextPageToken as string | null;
  const nodes = page.items.map(map);
  return {
    edges: nodes.map((node, i) => ({
      cursor: i === nodes.length - 1 ? (next ?? '') : '',
      node,
    })),
    next,
  };
}

export class ForYouResource {
  constructor(private client: AlvaClient) {}

  /** One newest-first page. Does not truncate content or advance a watermark. */
  async list(params: ForYouListParams = {}): Promise<ForYouConnection> {
    validateForYouListParams(params);
    this.client._requireAuth();
    const page = await this.client._v2Request<Page<unknown>>(
      'GET',
      '/me/for-you-entries',
      {
        query: {
          pageSize: params.first ?? 20,
          pageToken: params.after,
          automationId: params.feedId,
        },
      }
    );
    const { edges: items, next } = edges(page, forYouEntry);
    return {
      edges: items,
      pageInfo: {
        startCursor: params.after ?? '',
        endCursor: next ?? '',
        hasNextPage: next !== null,
        hasPreviousPage: params.after !== undefined,
      },
    };
  }

  /**
   * One ranked page of Thesis recommendations -- the stream the Feed App reads,
   * which is not the chronological `list` stream. Page to `exhausted` and filter
   * on `publication.publishedAtMs` yourself; the order is slot-mixed, so a time
   * bound is never a reason to stop paging. Publications the viewer already saw
   * are withheld by an upstream cooldown, so a window read is "recommended and
   * recent", not every publication in the window. Reading records no
   * impression: a Toolkit read must not consume the reader's own feed.
   */
  async theses(
    params: ForYouThesesParams = {}
  ): Promise<ThesisRecommendationPage> {
    validateForYouThesesParams(params);
    this.client._requireAuth();
    const page = await this.client._v2Request<Page<unknown>>(
      'GET',
      '/me/for-you',
      {
        query: {
          ranking: 'THESIS_ONLY',
          pageSize: params.first ?? 10,
          pageToken: params.after,
        },
      }
    );
    const { edges: items, next } = edges(page, (item) => {
      if (!record(item) || !nonempty(item.id) || !nonempty(item.itemId)) {
        throw invalidThesisResponse();
      }
      return {
        itemKey: item.itemId,
        publication: publicationSummary(
          publishedThesis(item.thesis),
          item.itemId,
          item.id
        ),
      };
    });
    const start = params.after ?? '';
    return {
      edges: items,
      pageInfo: {
        startCursor: start,
        endCursor: next ?? '',
        hasNextPage: next !== null,
        hasPreviousPage: params.after !== undefined,
      },
      listId: '',
      pageCursor: start,
      nextCursor: next,
      exhausted: next === null,
      scanLimited: false,
    };
  }
}
