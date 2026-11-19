import { AlvaError, type InvalidParam } from './error.js';

// The /api/v2 platform API transport (alva-gateway
// docs/changelogs/2026-11-19-agent-api-permissions.md, D10;
// doc/api-v2-conventions.md). AlvaClient._v2Request and _v2Pages send; this
// module holds the parts that do not need a client.

export type V2Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** A query parameter value; an array is sent as one parameter per element. */
export type QueryValue =
  | string
  | number
  | bigint
  | boolean
  | readonly (string | number | bigint | boolean)[];

/** Query parameters; undefined and null are omitted. */
export type Query = Record<string, QueryValue | null | undefined>;

export interface V2RequestOptions {
  query?: Query;
  /** JSON body; on PATCH a JSON Merge Patch (RFC 7396): an absent member is unchanged, null clears it. */
  body?: unknown;
  /** Raw JSON text, for bodies that must keep their literals as written. */
  jsonBody?: string;
  /** Raw bytes, sent as application/octet-stream. */
  rawBody?: BodyInit;
  /**
   * Idempotency-Key of a write. Pass the same key to every attempt of one
   * logical write; when omitted, each call sends a new UUID.
   */
  idempotencyKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** One page of an /api/v2 collection; a null nextPageToken ends the list. */
export interface Page<T> {
  items: T[];
  nextPageToken: string | null;
}

export interface V2PageOptions {
  /** Other query parameters of the list; pageSize and pageToken are set by the iterator. */
  query?: Query;
  pageSize?: number;
  /** Token of the first page to read; omitted starts at the beginning. */
  pageToken?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Encodes query parameters as `?a=1&b=x&b=y`, or '' when there are none. */
export function encodeQuery(query: Query | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    const values: readonly unknown[] = Array.isArray(value) ? value : [value];
    for (const v of values) params.append(name, String(v));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Builds a path relative to /api/v2, percent-encoding each interpolated value
 * as one segment: v2Path`/theses/${id}/archive`. An empty, "." or ".." value
 * is refused, so a value cannot name another route.
 */
export function v2Path(
  strings: TemplateStringsArray,
  ...values: readonly (string | number | bigint)[]
): string {
  let path = strings[0];
  values.forEach((value, i) => {
    const segment = String(value);
    if (segment === '' || segment === '.' || segment === '..') {
      throw new AlvaError(
        'INVALID_ARGUMENT',
        `invalid path segment ${JSON.stringify(segment)}`,
        400
      );
    }
    path += encodeURIComponent(segment) + strings[i + 1];
  });
  return path;
}

/** RFC 4122 v4 UUID without assuming `crypto.randomUUID` (absent on Node 18 and older browsers). */
export function generateRequestId(): string {
  const webcrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (typeof webcrypto?.randomUUID === 'function')
    return webcrypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof webcrypto?.getRandomValues === 'function') {
    webcrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1)
      bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    ''
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function seconds(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function invalidParams(value: unknown): InvalidParam[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isRecord).map((p) => ({
    name: String(p.name ?? ''),
    reason: String(p.reason ?? ''),
  }));
}

/** Delta-seconds of a Retry-After header, the form the gateway sends. */
function retryAfterHeader(value: string | null): number | undefined {
  const v = value?.trim();
  return v && /^[0-9]+$/.test(v) ? Number(v) : undefined;
}

/**
 * Turns a failed /api/v2 response into an AlvaError: an RFC 9457 problem
 * gives code, detail and its extension members; the v1 error envelope, which
 * middleware in front of the routes may still write, and any other body are
 * read as `_request` reads them.
 */
export async function v2ResponseError(response: Response): Promise<AlvaError> {
  let bodyText = '';
  try {
    bodyText = await Promise.resolve(response.text());
  } catch {
    bodyText = '';
  }
  const status = response.status;
  const headerRetryAfter = retryAfterHeader(
    response.headers.get('retry-after')
  );
  const contentType = (
    response.headers.get('content-type') ?? ''
  ).toLowerCase();
  let data: unknown;
  if (
    bodyText &&
    (contentType.includes('application/json') || contentType.includes('+json'))
  ) {
    try {
      data = JSON.parse(bodyText);
    } catch {
      data = undefined;
    }
  }
  if (isRecord(data) && isRecord(data.error)) {
    return new AlvaError(
      stringOrUndefined(data.error.code) ?? 'UNKNOWN',
      stringOrUndefined(data.error.message) ?? `HTTP ${status}`,
      status,
      data.details,
      { retryAfter: headerRetryAfter }
    );
  }
  if (
    isRecord(data) &&
    (contentType.includes('application/problem+json') ||
      typeof data.code === 'string')
  ) {
    return new AlvaError(
      stringOrUndefined(data.code) ?? 'UNKNOWN',
      stringOrUndefined(data.detail) ??
        stringOrUndefined(data.title) ??
        `HTTP ${status}`,
      status,
      undefined,
      {
        requiredPermission: stringOrUndefined(data.requiredPermission),
        invalidParams: invalidParams(data.invalidParams),
        retryAfter: seconds(data.retryAfter) ?? headerRetryAfter,
      }
    );
  }
  return new AlvaError(
    'UNKNOWN',
    `HTTP ${status}: ${bodyText.slice(0, 200)}`,
    status,
    undefined,
    { retryAfter: headerRetryAfter }
  );
}

/** Reads every page and returns their items in order. */
export async function collectAll<T>(
  pages: AsyncIterable<Page<T>>
): Promise<T[]> {
  const items: T[] = [];
  for await (const page of pages) {
    for (const item of page.items) items.push(item);
  }
  return items;
}
