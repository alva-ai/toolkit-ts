import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import {
  THESIS_PUBLICATION_FIELDS,
  isPositiveInt64,
  isThesisPublication,
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
  newerThan?: string;
  feedId?: string;
}

/** The immutable publication selection, not the full mutable Feed object. */
export interface ForYouEntry {
  id: string;
  feed: { id: string };
  major: { id: string; feedId: string; number: number };
  displayName: string | null;
  source: string;
  eventTimeMs: number;
  publishedAtMs: number;
  title: string;
  body: string;
  actions: {
    type: 'OPEN_URL' | 'SEND_PROMPT' | 'CONNECT_PORTFOLIO' | 'CONNECT_IM';
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
      | 'WEB';
    url: string | null;
    iconUrl: string | null;
    title: string;
    subtitle: string | null;
    description: string | null;
    publishedAtMs: number;
  }[];
}

export interface ForYouConnection {
  edges: { cursor: string; node: ForYouEntry }[];
  pageInfo: {
    startCursor: string;
    endCursor: string;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

const FOR_YOU_QUERY = `
query ToolkitForYou($input: FeedEntryConnectionInput) {
  viewer {
    forYou(input: $input) {
      edges {
        cursor
        node {
          id
          feed { id }
          major { id feedId number }
          displayName source eventTimeMs publishedAtMs title body
          actions { type label url prompt }
          presentation {
            card {
              accentColor url thumbnailUrl footer
              fields { label value inline }
            }
          }
          tickers { symbol logoUrl sentiment }
          media { type coverUrl url }
          sources { type url iconUrl title subtitle description publishedAtMs }
        }
      }
      pageInfo { startCursor endCursor hasNextPage hasPreviousPage }
    }
  }
}
`.trim();

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
  if (params.feedId !== undefined && !isPositiveInt64(params.feedId)) {
    throw new Error('feedId must be a positive decimal int64 string');
  }
}

function invalidResponse(): never {
  throw new AlvaError(
    'GRAPHQL_INVALID_RESPONSE',
    'GraphQL returned an invalid For You connection',
    502
  );
}

function connection(value: unknown): ForYouConnection {
  if (
    !record(value) ||
    !Array.isArray(value.edges) ||
    !record(value.pageInfo)
  ) {
    return invalidResponse();
  }
  const page = value.pageInfo;
  if (
    typeof page.startCursor !== 'string' ||
    typeof page.endCursor !== 'string' ||
    typeof page.hasNextPage !== 'boolean' ||
    typeof page.hasPreviousPage !== 'boolean'
  ) {
    return invalidResponse();
  }
  for (const edge of value.edges) {
    if (
      !record(edge) ||
      typeof edge.cursor !== 'string' ||
      !edge.cursor.trim() ||
      !record(edge.node)
    )
      return invalidResponse();
    const node = edge.node;
    if (
      typeof node.id !== 'string' ||
      !node.id.startsWith('FeedEntry:') ||
      !isPositiveInt64(node.id.slice('FeedEntry:'.length)) ||
      !record(node.feed) ||
      !isPositiveInt64(node.feed.id) ||
      !record(node.major) ||
      typeof node.major.id !== 'string' ||
      !isPositiveInt64(node.major.feedId) ||
      typeof node.title !== 'string' ||
      typeof node.body !== 'string'
    ) {
      return invalidResponse();
    }
  }
  const first = value.edges[0];
  const last = value.edges[value.edges.length - 1];
  if (
    page.startCursor !== (first?.cursor ?? '') ||
    page.endCursor !== (last?.cursor ?? '') ||
    (value.edges.length === 0 && page.hasNextPage)
  )
    return invalidResponse();
  return value as unknown as ForYouConnection;
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
 * candidate pool; `scanLimited` means this page stopped at its scan budget and
 * more remains. A page may be empty while `hasNextPage` is still true, because
 * `endCursor` advances past scanned references that current visibility hides.
 *
 * `edges` is the only carrier. Gateway also returns an `items` list built from
 * the same nodes, but selecting it would put every publication body on the
 * wire twice for no extra information, so this read does not request it.
 */
export interface ThesisRecommendationPage {
  edges: { cursor: string; node: ThesisRecommendation }[];
  pageInfo: {
    startCursor: string;
    endCursor: string;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  listId: string;
  pageCursor: string;
  nextCursor: string | null;
  exhausted: boolean;
  scanLimited: boolean;
}

/**
 * Selects no exposure input. `pendingEvents` and `seenItemKeys` are the only
 * way this read records that the viewer saw a publication, so the SDK never
 * sends them: a Toolkit read must not consume the reader's own feed.
 */
const THESIS_RECOMMENDATION_QUERY = `
query ToolkitForYouTheses($input: ThesisRecommendationInput) {
  viewer {
    thesisRecommendations(input: $input) {
      listId pageCursor nextCursor exhausted scanLimited
      pageInfo { startCursor endCursor hasNextPage hasPreviousPage }
      edges {
        cursor
        node {
          itemKey
          publication {
            ${THESIS_PUBLICATION_FIELDS}
          }
        }
      }
    }
  }
}
`.trim();

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

/**
 * Shared GraphQL envelope handling. A partial `errors` array fails closed even
 * when `data` is present, and an absent viewer field is a 502 rather than an
 * empty result, so a caller never mistakes a broken read for "nothing new".
 */
function graphqlViewerField(response: unknown, field: string): unknown {
  if (!record(response)) {
    throw new AlvaError(
      'GRAPHQL_INVALID_RESPONSE',
      `GraphQL returned an invalid viewer.${field} response`,
      502
    );
  }
  if (response.errors !== undefined) {
    if (!Array.isArray(response.errors)) {
      throw new AlvaError(
        'GRAPHQL_INVALID_RESPONSE',
        `GraphQL returned an invalid viewer.${field} response`,
        502
      );
    }
    if (response.errors.length > 0) {
      const messages = response.errors.flatMap((error: unknown) =>
        record(error) && typeof error.message === 'string'
          ? [error.message]
          : []
      );
      throw new AlvaError(
        'GRAPHQL_ERROR',
        messages.join('; ') || 'GraphQL request failed',
        400,
        { errors: response.errors }
      );
    }
  }
  if (
    !record(response.data) ||
    !record(response.data.viewer) ||
    response.data.viewer[field] == null
  ) {
    throw new AlvaError(
      'GRAPHQL_EMPTY_RESPONSE',
      `GraphQL response did not include viewer.${field}`,
      502
    );
  }
  return response.data.viewer[field];
}

function invalidPage(): never {
  throw new AlvaError(
    'GRAPHQL_INVALID_RESPONSE',
    'GraphQL returned an invalid Thesis recommendation page',
    502
  );
}

function recommendationPage(value: unknown): ThesisRecommendationPage {
  if (
    !record(value) ||
    !Array.isArray(value.edges) ||
    !record(value.pageInfo) ||
    typeof value.listId !== 'string' ||
    typeof value.pageCursor !== 'string' ||
    typeof value.exhausted !== 'boolean' ||
    typeof value.scanLimited !== 'boolean' ||
    (value.nextCursor !== null && typeof value.nextCursor !== 'string')
  ) {
    return invalidPage();
  }
  const page = value.pageInfo;
  if (
    typeof page.startCursor !== 'string' ||
    typeof page.endCursor !== 'string' ||
    typeof page.hasNextPage !== 'boolean' ||
    typeof page.hasPreviousPage !== 'boolean' ||
    page.hasNextPage !== (value.nextCursor !== null)
  ) {
    return invalidPage();
  }
  for (const edge of value.edges) {
    if (
      !record(edge) ||
      typeof edge.cursor !== 'string' ||
      !edge.cursor.trim() ||
      !record(edge.node) ||
      typeof edge.node.itemKey !== 'string' ||
      !edge.node.itemKey.trim() ||
      !isThesisPublication(edge.node.publication)
    ) {
      return invalidPage();
    }
  }
  const first = value.edges[0];
  if (page.startCursor !== (first?.cursor ?? '')) return invalidPage();
  return value as unknown as ThesisRecommendationPage;
}

export class ForYouResource {
  constructor(private client: AlvaClient) {}

  /** One newest-first page. Does not truncate content or advance a watermark. */
  async list(params: ForYouListParams = {}): Promise<ForYouConnection> {
    validateForYouListParams(params);
    this.client._requireAuth();
    const response = await this.client._request('POST', '/query', {
      body: {
        query: FOR_YOU_QUERY,
        variables: {
          input: {
            first: params.first ?? 20,
            after: params.after,
            newerThan: params.newerThan,
            feedId: params.feedId,
          },
        },
      },
    });
    return connection(graphqlViewerField(response, 'forYou'));
  }

  /**
   * One ranked page of Thesis recommendations -- the stream the Feed App reads,
   * which is not the chronological `list` stream. Page to `exhausted` and filter
   * on `publication.publishedAtMs` yourself; the order is slot-mixed, so a time
   * bound is never a reason to stop paging. Publications the viewer already saw
   * are withheld by an upstream cooldown, so a window read is "recommended and
   * recent", not every publication in the window.
   */
  async theses(
    params: ForYouThesesParams = {}
  ): Promise<ThesisRecommendationPage> {
    validateForYouThesesParams(params);
    this.client._requireAuth();
    const response = await this.client._request('POST', '/query', {
      body: {
        query: THESIS_RECOMMENDATION_QUERY,
        variables: {
          input: { first: params.first ?? 10, after: params.after },
        },
      },
    });
    const field = graphqlViewerField(response, 'thesisRecommendations');
    return recommendationPage(field);
  }
}
