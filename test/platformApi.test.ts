import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../src/client.js';
import { AlvaError, alvaErrorOutput } from '../src/error.js';
import {
  collectAll,
  encodeQuery,
  generateRequestId,
  idempotencyKeyHeader,
  orNull,
  retryDelayMs,
  v2Path,
  type Page,
} from '../src/platformApi.js';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const QUOTED_UUID_V4 =
  /^"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"$/;

function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function problem(
  status: number,
  fields: Record<string, unknown>,
  headers: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify({
      type: `https://alva.ai/problems/${String(fields.code).toLowerCase().replaceAll('_', '-')}`,
      title: 'Problem',
      status,
      detail: 'problem detail',
      reason: null,
      requiredPermission: null,
      invalidParams: null,
      retryAfter: null,
      ...fields,
    }),
    {
      status,
      headers: { 'content-type': 'application/problem+json', ...headers },
    }
  );
}

function mockFetch(...responses: Response[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function call(fn: ReturnType<typeof vi.fn>, i: number) {
  const [url, init] = fn.mock.calls[i] as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
}

async function rejection(promise: Promise<unknown>): Promise<AlvaError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(AlvaError);
    return e as AlvaError;
  }
  throw new Error('expected a rejection');
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('encodeQuery', () => {
  it('repeats a parameter per array element and omits absent values', () => {
    expect(
      encodeQuery({
        symbol: ['NVDA', 'BRK.B'],
        pageSize: 50,
        includeClosed: false,
        after: 9007199254740993n,
        pageToken: undefined,
        kind: null,
        empty: [],
        q: 'a b&c',
      })
    ).toBe(
      '?symbol=NVDA&symbol=BRK.B&pageSize=50&includeClosed=false&after=9007199254740993&q=a+b%26c'
    );
  });

  it('is empty without parameters', () => {
    expect(encodeQuery(undefined)).toBe('');
    expect(encodeQuery({ a: undefined, b: [] })).toBe('');
  });
});

describe('v2Path', () => {
  it('encodes each value as one segment', () => {
    expect(v2Path`/playbooks/by-slug/${'alice'}/${'a/b c'}/x`).toBe(
      '/playbooks/by-slug/alice/a%2Fb%20c/x'
    );
    expect(v2Path`/theses/by-number/${42}`).toBe('/theses/by-number/42');
  });

  it('refuses a value that would name another route', () => {
    for (const bad of ['', '.', '..']) {
      expect(() => v2Path`/theses/${bad}/archive`).toThrow(AlvaError);
    }
  });
});

describe('generateRequestId', () => {
  it('produces RFC 4122 v4 ids even without crypto.randomUUID', () => {
    expect(generateRequestId()).toMatch(UUID_V4);
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
    });
    try {
      expect(generateRequestId()).toMatch(UUID_V4);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        value: original,
        configurable: true,
      });
    }
  });
});

describe('AlvaClient._v2Request', () => {
  it('sends to {baseUrl}/api/v2 with the credential and query', async () => {
    const fn = mockFetch(json(200, { id: 'task_0abc' }));
    const client = new AlvaClient({
      apiKey: 'key-1',
      baseUrl: 'http://gw.test',
    });

    const result = await client._v2Request('GET', '/me/tasks', {
      query: { status: ['RUNNING', 'PAUSED'], pageSize: 10 },
    });

    expect(result).toEqual({ id: 'task_0abc' });
    const { url, init, headers } = call(fn, 0);
    expect(url).toBe(
      'http://gw.test/api/v2/me/tasks?status=RUNNING&status=PAUSED&pageSize=10'
    );
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(headers['X-Alva-Api-Key']).toBe('key-1');
    expect(headers['Content-Type']).toBeUndefined();
    expect(headers['Idempotency-Key']).toBeUndefined();
  });

  it('sends JSON on POST and a merge patch on PATCH, keeping null', async () => {
    const fn = mockFetch(json(200, {}), json(200, {}));
    const client = new AlvaClient({ apiKey: 'k' });

    await client._v2Request('POST', '/cronjobs', { body: { name: 'n' } });
    await client._v2Request('PATCH', '/cronjobs/cronjob_0x', {
      body: { description: null, name: 'm' },
    });

    expect(call(fn, 0).headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(call(fn, 0).init.body as string)).toEqual({ name: 'n' });
    expect(call(fn, 1).init.method).toBe('PATCH');
    expect(call(fn, 1).headers['Content-Type']).toBe(
      'application/merge-patch+json'
    );
    expect(call(fn, 1).init.body).toBe('{"description":null,"name":"m"}');
  });

  it('refuses an answer that is not a JSON object', async () => {
    mockFetch(
      new Response(null, { status: 204 }),
      json(200, [1]),
      json(200, null),
      new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
      new Response('{', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const client = new AlvaClient({ apiKey: 'k' });

    for (let i = 0; i < 5; i += 1) {
      const err = await rejection(
        client._v2Request('DELETE', '/cronjobs/cronjob_0x')
      );
      expect([err.code, err.status, err.message]).toEqual([
        'INVALID_RESPONSE',
        502,
        'DELETE /api/v2/cronjobs/cronjob_0x did not return a JSON object',
      ]);
    }
  });

  it('refuses a PBSV or viewer token before sending', async () => {
    const fn = mockFetch();
    for (const config of [
      { pbsvToken: 'pbsv', apiKey: 'k' },
      { viewer_token: 'viewer' },
    ]) {
      const err = await rejection(
        new AlvaClient(config)._v2Request('GET', '/me')
      );
      expect([err.code, err.status]).toEqual(['CREDENTIAL_REQUIRED', 401]);
      expect(err.message).toBe(
        'GET /api/v2/me needs an API key: the 1.x SDK sends no PBSV or viewer token to /api/v2. Use client.v1, or @alva-ai/toolkit@0.36 in a browser page.'
      );
    }
    expect(fn).not.toHaveBeenCalled();
  });

  it('sends a call without a credential as it is', async () => {
    const fn = mockFetch(json(200, { openapi: '3.1.0' }));

    await new AlvaClient({})._v2Request('GET', '/openapi.json');

    expect(call(fn, 0).headers).toEqual({});
  });
});

describe('AlvaClient._v2Fetch', () => {
  it('returns the response of a raw-bytes route with its headers', async () => {
    const fn = mockFetch(
      new Response('bc', {
        status: 206,
        headers: {
          'content-type': 'text/plain',
          'content-range': 'bytes 1-2/3',
        },
      }),
      json(200, { bytesWritten: 3 })
    );
    const client = new AlvaClient({ apiKey: 'k' });

    const read = await client._v2Fetch('GET', '/fs/read', {
      query: { path: '~/a.txt' },
      range: 'bytes=1-2',
    });
    const bytes = new Uint8Array([1, 2, 3]);
    await client._v2Fetch('POST', '/fs/write', {
      query: { path: '~/a.bin' },
      rawBody: bytes,
      contentType: 'image/png',
    });

    expect(await read.text()).toBe('bc');
    expect(read.headers.get('content-range')).toBe('bytes 1-2/3');
    expect(call(fn, 0).headers.Range).toBe('bytes=1-2');
    expect(call(fn, 1).headers['Content-Type']).toBe('image/png');
    expect(call(fn, 1).init.body).toBe(bytes);
  });
});

describe('Idempotency-Key', () => {
  it('gives every POST and PATCH its own quoted UUID, and GET and DELETE none', async () => {
    const fn = mockFetch(
      json(200, {}),
      json(200, {}),
      json(200, {}),
      json(200, {}),
      json(200, {})
    );
    const client = new AlvaClient({ apiKey: 'k' });

    await client._v2Request('POST', '/web-searches', { body: { query: 'a' } });
    await client._v2Request('POST', '/web-searches', { body: { query: 'a' } });
    await client._v2Request('PATCH', '/cronjobs/cronjob_0x', { body: {} });
    await client._v2Request('DELETE', '/cronjobs/cronjob_0x');
    await client._v2Request('GET', '/me');

    const keys = [0, 1, 2].map((i) => call(fn, i).headers['Idempotency-Key']);
    for (const key of keys) expect(key).toMatch(QUOTED_UUID_V4);
    expect(new Set(keys).size).toBe(3);
    expect(call(fn, 3).headers['Idempotency-Key']).toBeUndefined();
    expect(call(fn, 4).headers['Idempotency-Key']).toBeUndefined();
  });

  it("sends the caller's key quoted, and refuses one the gateway would", async () => {
    const fn = mockFetch(json(200, {}));
    const client = new AlvaClient({ apiKey: 'k' });

    await client._v2Request('POST', '/runs', { idempotencyKey: 'run-7' });
    expect(call(fn, 0).headers['Idempotency-Key']).toBe('"run-7"');

    for (const bad of ['', 'a"b', 'a\\b', 'a b', 'é', 'x'.repeat(256)]) {
      const err = await rejection(
        client._v2Request('POST', '/runs', { idempotencyKey: bad })
      );
      expect([err.code, err.reason]).toEqual([
        'INVALID_ARGUMENT',
        'IDEMPOTENCY_KEY_INVALID',
      ]);
    }
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('formats the header as an RFC 9651 sf-string', () => {
    expect(idempotencyKeyHeader('8e03978e-40d5-43e8-bc93-6894a57f9324')).toBe(
      '"8e03978e-40d5-43e8-bc93-6894a57f9324"'
    );
    expect(idempotencyKeyHeader('!#[]~')).toBe('"!#[]~"');
  });
});

describe('retries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Runs a call to completion, advancing fake time through its waits. */
  async function settle<T>(promise: Promise<T>): Promise<T> {
    const settled = promise.then(
      (value) => ({ value }),
      (error: unknown) => ({ error })
    );
    for (let i = 0; i < 20; i += 1) await vi.advanceTimersByTimeAsync(5_000);
    const result = await settled;
    if ('error' in result) throw result.error;
    return result.value;
  }

  const networkError = () =>
    Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ECONNRESET' },
    });

  /** A 200 JSON response whose body fails after the headers arrived. */
  const brokenBody = (error: unknown = new TypeError('terminated')) =>
    new Response(
      new ReadableStream({
        pull(controller) {
          controller.error(error);
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  it.each([
    ['a network error', () => Promise.reject(networkError())],
    ['a body that fails to download', () => brokenBody()],
    [
      '409 IDEMPOTENCY_KEY_IN_USE',
      () =>
        problem(
          409,
          {
            code: 'CONFLICT',
            reason: 'IDEMPOTENCY_KEY_IN_USE',
            retryAfter: 1,
          },
          { 'retry-after': '1' }
        ),
    ],
    [
      '429 with Retry-After 30',
      () =>
        problem(
          429,
          { code: 'RATE_LIMITED', reason: 'QUOTA_EXCEEDED', retryAfter: 30 },
          { 'retry-after': '30' }
        ),
    ],
    ['502', () => new Response('bad gateway', { status: 502 })],
    ['503', () => problem(503, { code: 'UNAVAILABLE' })],
    ['504', () => problem(504, { code: 'DEADLINE_EXCEEDED' })],
  ])('retries %s with the same key and body bytes', async (_name, failure) => {
    const fn = vi.fn();
    fn.mockImplementationOnce(failure);
    fn.mockResolvedValueOnce(json(200, { id: 'run_0x' }));
    globalThis.fetch = fn as unknown as typeof fetch;
    const client = new AlvaClient({ apiKey: 'k' });

    await expect(
      settle(client._v2Request('POST', '/runs', { body: { code: '1+1' } }))
    ).resolves.toEqual({ id: 'run_0x' });

    expect(fn).toHaveBeenCalledTimes(2);
    expect(call(fn, 1).headers['Idempotency-Key']).toBe(
      call(fn, 0).headers['Idempotency-Key']
    );
    expect(call(fn, 1).init.body).toBe(call(fn, 0).init.body);
  });

  it.each([
    ['500', () => problem(500, { code: 'INTERNAL' })],
    ['400', () => problem(400, { code: 'INVALID_ARGUMENT' })],
    [
      'another 409',
      () =>
        problem(409, { code: 'CONFLICT', reason: 'IDEMPOTENCY_KEY_REUSED' }),
    ],
    ['429 without Retry-After', () => problem(429, { code: 'RATE_LIMITED' })],
    [
      '429 with Retry-After 31',
      () => problem(429, { code: 'RATE_LIMITED' }, { 'retry-after': '31' }),
    ],
    [
      '503 RELATED_THESES_GENERATING',
      () =>
        problem(503, {
          code: 'UNAVAILABLE',
          reason: 'RELATED_THESES_GENERATING',
          retryAfter: 30,
        }),
    ],
  ])('does not retry %s', async (_name, failure) => {
    const fn = vi.fn().mockImplementation(failure);
    globalThis.fetch = fn as unknown as typeof fetch;
    const client = new AlvaClient({ apiKey: 'k' });

    await expect(
      settle(client._v2Request('POST', '/runs', { body: {} }))
    ).rejects.toBeInstanceOf(AlvaError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('makes at most three attempts and throws the last failure', async () => {
    const fn = vi
      .fn()
      .mockImplementation(() => problem(503, { code: 'UNAVAILABLE' }));
    globalThis.fetch = fn as unknown as typeof fetch;
    const client = new AlvaClient({ apiKey: 'k' });

    const err = await rejection(settle(client._v2Request('GET', '/me')));

    expect([err.code, err.status]).toEqual(['UNAVAILABLE', 503]);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('waits for Retry-After and stops when the next wait passes 60 s', async () => {
    const times: number[] = [];
    const fn = vi.fn().mockImplementation(() => {
      times.push(Date.now());
      return problem(
        503,
        { code: 'UNAVAILABLE', retryAfter: 40 },
        { 'retry-after': '40' }
      );
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    const client = new AlvaClient({ apiKey: 'k' });

    await expect(settle(client._v2Request('GET', '/me'))).rejects.toMatchObject(
      { code: 'UNAVAILABLE' }
    );

    expect(fn).toHaveBeenCalledTimes(2);
    expect(times[1] - times[0]).toBe(40_000);
  });

  it('ends the wait when the caller aborts', async () => {
    const fn = vi
      .fn()
      .mockImplementation(() => problem(503, { code: 'UNAVAILABLE' }));
    globalThis.fetch = fn as unknown as typeof fetch;
    const controller = new AbortController();
    const client = new AlvaClient({ apiKey: 'k' });

    const request = rejection(
      client._v2Request('GET', '/me', { signal: controller.signal })
    );
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    const err = await request;

    expect(err.code).toBe('NETWORK_ABORTED');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reports a body download the caller aborts as NETWORK_ABORTED, on the last attempt too', async () => {
    const controller = new AbortController();
    const fn = vi
      .fn()
      .mockImplementationOnce(() => problem(503, { code: 'UNAVAILABLE' }))
      .mockImplementationOnce(() => problem(503, { code: 'UNAVAILABLE' }))
      .mockImplementationOnce(() => {
        controller.abort();
        return brokenBody(new DOMException('aborted', 'AbortError'));
      });
    globalThis.fetch = fn as unknown as typeof fetch;
    const client = new AlvaClient({ apiKey: 'k' });

    await expect(
      settle(client._v2Request('GET', '/me', { signal: controller.signal }))
    ).rejects.toMatchObject({ code: 'NETWORK_ABORTED', status: 0 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a timed-out attempt', async () => {
    const fn = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason)
          );
        })
    );
    globalThis.fetch = fn as unknown as typeof fetch;
    const client = new AlvaClient({ apiKey: 'k' });

    await expect(
      settle(client._v2Request('GET', '/me', { timeoutMs: 50 }))
    ).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('backs off 0.5 s × 2^(n-1) with ±20 % jitter, never under Retry-After', () => {
    const unavailable = new AlvaError('UNAVAILABLE', 'x', 503);
    expect(retryDelayMs(unavailable, 1, () => 0)).toBe(400);
    expect(retryDelayMs(unavailable, 1, () => 1)).toBe(600);
    expect(retryDelayMs(unavailable, 2, () => 0.5)).toBe(1000);
    const later = new AlvaError('UNAVAILABLE', 'x', 503, undefined, {
      retryAfter: 2,
    });
    expect(retryDelayMs(later, 1, () => 1)).toBe(2000);
  });
});

describe('problem parsing', () => {
  it('reads code, reason, type, status, detail and requiredPermission', async () => {
    mockFetch(
      problem(403, {
        type: 'https://alva.ai/problems/insufficient-permission',
        code: 'INSUFFICIENT_PERMISSION',
        detail: 'the credential lacks the trading_limits:write permission',
        requiredPermission: 'trading_limits:write',
      }),
      problem(422, {
        type: 'https://alva.ai/problems/idempotency-key-reused',
        code: 'INVALID_ARGUMENT',
        reason: 'IDEMPOTENCY_KEY_REUSED',
        detail: 'this Idempotency-Key was used for a different request',
      })
    );
    const client = new AlvaClient({ apiKey: 'k' });

    const err = await rejection(
      client._v2Request('PATCH', '/me/risk-rules', { body: {} })
    );
    expect(err.code).toBe('INSUFFICIENT_PERMISSION');
    expect(err.status).toBe(403);
    expect(err.message).toBe(
      'the credential lacks the trading_limits:write permission'
    );
    expect(err.type).toBe('https://alva.ai/problems/insufficient-permission');
    expect(err.requiredPermission).toBe('trading_limits:write');
    expect('reason' in err).toBe(false);
    expect(err.invalidParams).toBeUndefined();
    expect(err.retryAfter).toBeUndefined();

    const reused = await rejection(client._v2Request('POST', '/runs'));
    expect([reused.code, reused.reason, reused.status, reused.type]).toEqual([
      'INVALID_ARGUMENT',
      'IDEMPOTENCY_KEY_REUSED',
      422,
      'https://alva.ai/problems/idempotency-key-reused',
    ]);
  });

  it('reads invalidParams', async () => {
    mockFetch(
      problem(400, {
        code: 'INVALID_ARGUMENT',
        detail: 'invalid query parameters',
        invalidParams: [
          { name: 'pageSize', reason: 'must be an integer' },
          { name: 'cursor', reason: 'unknown parameter' },
        ],
      })
    );
    const client = new AlvaClient({ apiKey: 'k' });

    const err = await rejection(client._v2Request('GET', '/me/tasks'));

    expect(err.code).toBe('INVALID_ARGUMENT');
    expect(err.status).toBe(400);
    expect(err.invalidParams).toEqual([
      { name: 'pageSize', reason: 'must be an integer' },
      { name: 'cursor', reason: 'unknown parameter' },
    ]);
  });

  it('reads retryAfter from the problem, else from Retry-After', async () => {
    // Over 30 s, so none of them is retried.
    mockFetch(
      problem(
        429,
        { code: 'RATE_LIMITED', retryAfter: 45 },
        { 'retry-after': '60' }
      ),
      problem(429, { code: 'RATE_LIMITED' }, { 'retry-after': '60' }),
      new Response('slow down', {
        status: 429,
        headers: { 'retry-after': '40', 'content-type': 'text/plain' },
      })
    );
    const client = new AlvaClient({ apiKey: 'k' });

    expect((await rejection(client._v2Request('GET', '/a'))).retryAfter).toBe(
      45
    );
    expect((await rejection(client._v2Request('GET', '/a'))).retryAfter).toBe(
      60
    );
    const plain = await rejection(client._v2Request('GET', '/a'));
    expect(plain.code).toBe('UNKNOWN');
    expect(plain.retryAfter).toBe(40);
  });

  it('falls back to the title, the v1 envelope and the body text', async () => {
    mockFetch(
      problem(500, { code: 'INTERNAL', detail: '', title: 'Internal error' }),
      json(401, { error: { code: 'UNAUTHENTICATED', message: 'bad key' } }),
      new Response('404 page not found', {
        status: 404,
        headers: { 'content-type': 'text/plain' },
      })
    );
    const client = new AlvaClient({ apiKey: 'k' });

    const internal = await rejection(client._v2Request('GET', '/a'));
    expect([internal.code, internal.message]).toEqual([
      'INTERNAL',
      'Internal error',
    ]);
    const v1 = await rejection(client._v2Request('GET', '/a'));
    expect([v1.code, v1.message, v1.status]).toEqual([
      'UNAUTHENTICATED',
      'bad key',
      401,
    ]);
    const text = await rejection(client._v2Request('GET', '/a'));
    expect([text.code, text.message, text.status]).toEqual([
      'UNKNOWN',
      'HTTP 404: 404 page not found',
      404,
    ]);
    expect('requiredPermission' in text).toBe(false);
  });

  it('reads /api/v1 failures with the same parser', async () => {
    mockFetch(
      problem(403, {
        code: 'PERMISSION_DENIED',
        reason: 'ACCOUNT_BANNED',
        detail: 'banned',
      }),
      json(404, {
        error: { code: 'NOT_FOUND', message: 'gone' },
        details: { reason: 'X' },
      })
    );
    const client = new AlvaClient({ apiKey: 'k' });

    const banned = await rejection(client._request('GET', '/api/v1/me'));
    expect([banned.code, banned.reason, banned.message]).toEqual([
      'PERMISSION_DENIED',
      'ACCOUNT_BANNED',
      'banned',
    ]);
    const gone = await rejection(client._request('GET', '/api/v1/me'));
    expect([gone.code, gone.message, gone.details]).toEqual([
      'NOT_FOUND',
      'gone',
      { reason: 'X' },
    ]);
    expect('reason' in gone).toBe(false);
  });

  it('prints the problem members in the CLI error, and only when present', () => {
    const withProblem = new AlvaError(
      'INVALID_ARGUMENT',
      'bad',
      400,
      undefined,
      {
        reason: 'PAGE_TOKEN_INVALID',
        type: 'https://alva.ai/problems/page-token-invalid',
        invalidParams: [{ name: 'pageToken', reason: 'send it unchanged' }],
      }
    );
    expect(JSON.parse(JSON.stringify(alvaErrorOutput(withProblem)))).toEqual({
      error: {
        code: 'INVALID_ARGUMENT',
        reason: 'PAGE_TOKEN_INVALID',
        message: 'bad',
        status: 400,
        type: 'https://alva.ai/problems/page-token-invalid',
        invalidParams: [{ name: 'pageToken', reason: 'send it unchanged' }],
      },
    });
    const v1 = new AlvaError('NOT_FOUND', 'gone', 404, { reason: 'X' });
    expect(JSON.parse(JSON.stringify(alvaErrorOutput(v1)))).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'gone',
        status: 404,
        details: { reason: 'X' },
      },
    });
  });
});

describe('orNull', () => {
  it('is null for 404 only', async () => {
    const notFound = new AlvaError('NOT_FOUND', 'gone', 404);
    const denied = new AlvaError('PERMISSION_DENIED', 'no', 403);

    await expect(orNull(Promise.resolve({ id: 'x' }))).resolves.toEqual({
      id: 'x',
    });
    await expect(orNull(Promise.reject(notFound))).resolves.toBeNull();
    await expect(orNull(Promise.reject(denied))).rejects.toBe(denied);
  });
});

describe('pagination', () => {
  it('follows nextPageToken until null, keeping the other parameters', async () => {
    const fn = mockFetch(
      json(200, { items: [1, 2], nextPageToken: 't1' }),
      json(200, { items: [3], nextPageToken: 't2' }),
      json(200, { items: [], nextPageToken: null })
    );
    const client = new AlvaClient({ apiKey: 'k', baseUrl: 'http://gw.test' });

    const items = await collectAll(
      client._v2Pages<number>('/me/cronjobs', {
        query: { status: ['ACTIVE'] },
        pageSize: 2,
      })
    );

    expect(items).toEqual([1, 2, 3]);
    expect(fn.mock.calls.map(([url]) => url)).toEqual([
      'http://gw.test/api/v2/me/cronjobs?status=ACTIVE&pageSize=2',
      'http://gw.test/api/v2/me/cronjobs?status=ACTIVE&pageSize=2&pageToken=t1',
      'http://gw.test/api/v2/me/cronjobs?status=ACTIVE&pageSize=2&pageToken=t2',
    ]);
  });

  it('starts at a given token and stops fetching when the caller stops', async () => {
    const fn = mockFetch(
      json(200, { items: ['a'], nextPageToken: 't3' }),
      json(200, { items: ['b'], nextPageToken: 't4' })
    );
    const client = new AlvaClient({ apiKey: 'k', baseUrl: 'http://gw.test' });

    const seen: Page<string>[] = [];
    for await (const page of client._v2Pages<string>('/feeds', {
      pageToken: 't2',
    })) {
      seen.push(page);
      break;
    }

    expect(seen).toEqual([{ items: ['a'], nextPageToken: 't3' }]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(call(fn, 0).url).toBe('http://gw.test/api/v2/feeds?pageToken=t2');
  });

  it('refuses a response that is not a page or does not advance', async () => {
    mockFetch(
      json(200, { id: 'feed_0x' }),
      json(200, { items: [1], nextPageToken: 't1' }),
      json(200, { items: [2], nextPageToken: 't1' })
    );
    const client = new AlvaClient({ apiKey: 'k' });

    const notPage = await rejection(collectAll(client._v2Pages('/feeds')));
    expect(notPage.code).toBe('INVALID_RESPONSE');
    const stuck = await rejection(collectAll(client._v2Pages('/feeds')));
    expect(stuck.message).toContain('returned the page token it was sent');
  });
});
