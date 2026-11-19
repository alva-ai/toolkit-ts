import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import type { AlvaId } from '../types.js';

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
  id: AlvaId;
  username: string;
  name: string;
}

export interface XPost {
  id: AlvaId;
  text: string;
  /** The author's ID; empty when X did not report one. */
  authorId: AlvaId;
  /** RFC 3339 time; empty when X did not report one. */
  createdAt: string;
  /** The post on x.com. */
  url: string;
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

function invalidResponse(path: string): never {
  throw new AlvaError(
    'INVALID_RESPONSE',
    `GET /api/v2${path} returned an invalid response`,
    502
  );
}

type Field = 'string' | 'string?';

/**
 * Rebuilds today's connection from one /api/v2 page. A v2 page has one
 * token, so every edge carries the page's next token as its cursor; a field
 * marked 'string?' may be null and reads as ''.
 */
function readPage<T>(
  page: unknown,
  path: string,
  params: XReadParams,
  fields: Record<keyof T & string, Field>
): XReadPage<T> {
  if (
    !record(page) ||
    !Array.isArray(page.items) ||
    (page.nextPageToken !== null && typeof page.nextPageToken !== 'string')
  )
    return invalidResponse(path);
  const next = page.nextPageToken ?? '';
  const edges = page.items.map((item: unknown) => {
    if (!record(item) || typeof item.id !== 'string' || !item.id)
      return invalidResponse(path);
    const node: Record<string, string> = {};
    for (const [key, kind] of Object.entries<Field>(fields)) {
      const value = item[key];
      if (kind === 'string?' && value === null) node[key] = '';
      else if (typeof value === 'string') node[key] = value;
      else return invalidResponse(path);
    }
    return { cursor: next, node: node as T };
  });
  return {
    edges,
    pageInfo: {
      startCursor: params.after ?? '',
      endCursor: next,
      hasNextPage: next !== '',
      hasPreviousPage: params.after !== undefined,
    },
    retrievedAt: new Date().toISOString(),
  };
}

/** Read-only access to the current user's connected X account. X tokens stay in Backend. */
export class XResource {
  constructor(private client: AlvaClient) {}

  async status(): Promise<XConnectionStatus> {
    this.client._requireAuth();
    const result = await this.client._v2Request('GET', '/me/x-connection');
    if (
      !record(result) ||
      typeof result.connected !== 'boolean' ||
      typeof result.canReadFollowing !== 'boolean' ||
      typeof result.canReadPosts !== 'boolean'
    )
      return invalidResponse('/me/x-connection');
    return {
      connected: result.connected,
      canReadFollowing: result.canReadFollowing,
      canReadPosts: result.canReadPosts,
    };
  }

  async following(params: XReadParams = {}): Promise<XReadPage<XAccount>> {
    return this.read<XAccount>('/me/x-following', params, {
      id: 'string',
      username: 'string',
      name: 'string',
    });
  }

  async posts(params: XReadParams = {}): Promise<XReadPage<XPost>> {
    return this.read<XPost>('/me/x-posts', params, {
      id: 'string',
      text: 'string',
      authorId: 'string?',
      createdAt: 'string?',
      url: 'string',
    });
  }

  private async read<T>(
    path: string,
    params: XReadParams,
    fields: Record<keyof T & string, Field>
  ): Promise<XReadPage<T>> {
    validateXReadParams(params);
    this.client._requireAuth();
    const page = await this.client._v2Request('GET', path, {
      query: { pageSize: params.first ?? 20, pageToken: params.after },
    });
    return readPage<T>(page, path, params, fields);
  }
}
