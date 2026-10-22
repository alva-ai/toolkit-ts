import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';

export interface XReadParams {
  first?: number;
  after?: string;
}

/** Local credential state, not live verification with X. */
export interface XConnectionStatus {
  connected: boolean;
  canReadFollowing: boolean;
  canReadPosts: boolean;
}

export interface XAccount {
  id: string;
  username: string;
  name: string;
}

export interface XPost {
  id: string;
  text: string;
  authorId: string;
  createdAt: string;
}

/** One live page. retrievedAt is client retrieval time, not an import timestamp. */
export interface XReadPage<T> {
  edges: { cursor: string; node: T }[];
  pageInfo: {
    startCursor: string;
    endCursor: string;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  retrievedAt: string;
}

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

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateXReadParams(params: XReadParams): void {
  if (!record(params)) throw new Error('X read parameters must be an object');
  const first = params.first ?? 20;
  if (
    params.first === null ||
    typeof first !== 'number' ||
    !Number.isInteger(first) ||
    first < 5 ||
    first > 100
  ) {
    throw new Error('first must be an integer between 5 and 100');
  }
  if (
    params.after !== undefined &&
    (typeof params.after !== 'string' ||
      !params.after.trim() ||
      params.after.length > 4096)
  ) {
    throw new Error(
      'after must be a non-empty X cursor of at most 4096 characters'
    );
  }
}

function invalidResponse(field: string): never {
  throw new AlvaError(
    'GRAPHQL_INVALID_RESPONSE',
    `GraphQL returned an invalid viewer.${field} response`,
    502
  );
}

function viewerField(response: unknown, field: string): unknown {
  if (!record(response)) return invalidResponse(field);
  if (response.errors !== undefined) {
    if (!Array.isArray(response.errors)) return invalidResponse(field);
    if (response.errors.length > 0) {
      const messages = response.errors.flatMap((error: unknown) =>
        record(error) && typeof error.message === 'string'
          ? [error.message]
          : []
      );
      const codes = response.errors.map((error: unknown) =>
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
      throw new AlvaError(
        code,
        messages.join('; ') || 'X read failed',
        GRAPHQL_STATUS_BY_CODE[code] ?? 502,
        { errors: response.errors }
      );
    }
  }
  if (!record(response.data) || !record(response.data.viewer))
    return invalidResponse(field);
  return response.data.viewer[field];
}

function readPage<T>(
  value: unknown,
  field: string,
  fields: readonly string[]
): XReadPage<T> {
  if (!record(value) || !Array.isArray(value.edges) || !record(value.pageInfo))
    return invalidResponse(field);
  const page = value.pageInfo;
  if (
    typeof page.startCursor !== 'string' ||
    typeof page.endCursor !== 'string' ||
    typeof page.hasNextPage !== 'boolean' ||
    typeof page.hasPreviousPage !== 'boolean' ||
    (page.hasNextPage && !page.endCursor)
  )
    return invalidResponse(field);
  for (const edge of value.edges) {
    if (
      !record(edge) ||
      typeof edge.cursor !== 'string' ||
      !edge.cursor ||
      !record(edge.node)
    )
      return invalidResponse(field);
    const node = edge.node;
    if (fields.some((key) => typeof node[key] !== 'string'))
      return invalidResponse(field);
    if (!node.id) return invalidResponse(field);
  }
  const first = value.edges[0];
  const last = value.edges[value.edges.length - 1];
  if (
    page.startCursor !== (first?.cursor ?? '') ||
    (last && page.endCursor !== last.cursor)
  )
    return invalidResponse(field);
  return {
    edges: value.edges,
    pageInfo: page,
    retrievedAt: new Date().toISOString(),
  } as XReadPage<T>;
}

/** Read-only access to the current user's connected X account. X tokens stay in Backend. */
export class XResource {
  constructor(private client: AlvaClient) {}

  async status(): Promise<XConnectionStatus> {
    this.client._requireAuth();
    const response = await this.client._request('POST', '/query', {
      body: {
        query:
          'query ToolkitXStatus { viewer { xConnection { connected canReadFollowing canReadPosts } } }',
      },
    });
    const result = viewerField(response, 'xConnection');
    if (
      !record(result) ||
      ['connected', 'canReadFollowing', 'canReadPosts'].some(
        (key) => typeof result[key] !== 'boolean'
      )
    )
      return invalidResponse('xConnection');
    return result as unknown as XConnectionStatus;
  }

  async following(params: XReadParams = {}): Promise<XReadPage<XAccount>> {
    return this.read<XAccount>('xFollowing', 'id username name', params);
  }

  async posts(params: XReadParams = {}): Promise<XReadPage<XPost>> {
    return this.read<XPost>('xPosts', 'id text authorId createdAt', params);
  }

  private async read<T>(
    field: 'xFollowing' | 'xPosts',
    fields: string,
    params: XReadParams
  ): Promise<XReadPage<T>> {
    validateXReadParams(params);
    this.client._requireAuth();
    const response = await this.client._request('POST', '/query', {
      body: {
        query: `query ToolkitXRead($first: Int, $after: String) { viewer { ${field}(first: $first, after: $after) { edges { cursor node { ${fields} } } pageInfo { startCursor endCursor hasNextPage hasPreviousPage } } } }`,
        variables: { first: params.first ?? 20, after: params.after },
      },
    });
    return readPage<T>(viewerField(response, field), field, fields.split(' '));
  }
}
