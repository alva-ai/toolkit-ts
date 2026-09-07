import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';

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

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  if (params.feedId !== undefined && !isPositiveInt64(params.feedId)) {
    throw new Error('feedId must be a positive decimal int64 string');
  }
}

function isPositiveInt64(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[1-9]\d{0,18}$/.test(value) &&
    BigInt(value) <= 9223372036854775807n
  );
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
    if (!record(response)) return invalidResponse();
    if (response.errors !== undefined) {
      if (!Array.isArray(response.errors)) return invalidResponse();
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
      response.data.viewer.forYou == null
    ) {
      throw new AlvaError(
        'GRAPHQL_EMPTY_RESPONSE',
        'GraphQL response did not include viewer.forYou',
        502
      );
    }
    return connection(response.data.viewer.forYou);
  }
}
