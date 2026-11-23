import { AlvaError } from './error.js';
import type { components, paths } from './generated/platform-v2.js';

// The /api/v2 platform API transport. The contract is
// openapi/alva-platform-v2.json (alva-gateway pkg/v2/api/openapi/openapi.json,
// served at GET /api/v2/openapi.json); src/generated/platform-v2.ts holds its
// types. AlvaClient._v2Fetch, _v2Request and _v2Pages send; this module holds
// the parts that do not need a client.

/** A schema of the /api/v2 contract: `Schema<'Thesis'>`. */
export type Schema<Name extends keyof components['schemas']> =
  components['schemas'][Name];

export type V2Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** The methods the contract declares for a path. */
type V2Operation<Path extends keyof paths> = {
  [M in Lowercase<V2Method>]: paths[Path][M] extends { parameters: unknown }
    ? M
    : never;
}[Lowercase<V2Method>];

/** The query parameters of a route: `V2Query<'/me/credit-entries', 'get'>`. */
export type V2Query<
  Path extends keyof paths,
  Method extends V2Operation<Path>,
> = paths[Path][Method] extends { parameters: { query?: infer Q } }
  ? NonNullable<Q>
  : never;

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
  /** Raw bytes (fs/write, uploads). Sent unchanged on every attempt. */
  rawBody?: Blob | BufferSource | string;
  /** Content-Type of rawBody; application/octet-stream when omitted. */
  contentType?: string;
  /** One byte range (`bytes=0-99`), for routes that read raw bytes. */
  range?: string;
  /**
   * Idempotency-Key of a POST or PATCH: one key per logical call, sent on
   * every retry of it. When omitted, the call gets a new UUID.
   */
  idempotencyKey?: string;
  /** Timeout of each attempt, in milliseconds. */
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

/**
 * The Idempotency-Key header value of a key: an RFC 9651 sf-string
 * (`"<key>"`, draft-ietf-httpapi-idempotency-key-header). The gateway takes
 * 1 to 255 printable ASCII characters without `"` or `\`.
 */
export function idempotencyKeyHeader(key: string): string {
  if (!/^[\x21\x23-\x5b\x5d-\x7e]{1,255}$/.test(key)) {
    throw new AlvaError(
      'INVALID_ARGUMENT',
      'an idempotency key is 1 to 255 printable ASCII characters without " or \\',
      400,
      undefined,
      {
        reason: 'IDEMPOTENCY_KEY_INVALID',
        invalidParams: [
          { name: 'Idempotency-Key', reason: 'must be printable ASCII' },
        ],
      }
    );
  }
  return `"${key}"`;
}

/**
 * A Decimal as the contract writes it: a plain decimal string with no
 * exponent, leading zeros or trailing fractional zeros (`-12.5`). This is
 * the vendored contract's Decimal pattern; test/openapi.test.ts keeps the
 * two equal.
 */
export const DECIMAL_PATTERN = /^-?(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/;

export const RETRY_MAX_ATTEMPTS = 3;
export const RETRY_BUDGET_MS = 60_000;
const RETRY_BASE_MS = 500;
const RETRY_AFTER_MAX_SECONDS = 30;

/**
 * The wait before attempt `attempt + 1` after `error`, in milliseconds, or
 * undefined when the failure is not retried. Retried: a network error, 409
 * IDEMPOTENCY_KEY_IN_USE, 429 with a Retry-After of at most 30 s, and 502,
 * 503 and 504, except RELATED_THESES_GENERATING. The wait is 0.5 s ×
 * 2^(attempt-1) ±20 %, and never shorter than the server's Retry-After.
 */
export function retryDelayMs(
  error: AlvaError,
  attempt: number,
  random: () => number = Math.random
): number | undefined {
  const retryAfterMs = (error.retryAfter ?? 0) * 1000;
  // RELATED_THESES_GENERATING is the Related read's own state.
  const retried =
    error.reason !== 'RELATED_THESES_GENERATING' &&
    (error.code === 'NETWORK_ERROR' ||
      error.status === 502 ||
      error.status === 503 ||
      error.status === 504 ||
      (error.status === 409 && error.reason === 'IDEMPOTENCY_KEY_IN_USE') ||
      (error.status === 429 &&
        error.retryAfter !== undefined &&
        error.retryAfter <= RETRY_AFTER_MAX_SECONDS));
  if (!retried) return undefined;
  const backoff = RETRY_BASE_MS * 2 ** (attempt - 1) * (0.8 + 0.4 * random());
  return Math.max(retryAfterMs, Math.round(backoff));
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

/** The result, or null when the resource does not exist (404). Other failures, 403 included, are thrown. */
export async function orNull<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (err) {
    if (err instanceof AlvaError && err.status === 404) return null;
    throw err;
  }
}
