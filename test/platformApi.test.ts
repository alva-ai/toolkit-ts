import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../src/client.js';
import { AlvaError, alvaErrorOutput } from '../src/error.js';
import {
  collectAll,
  encodeQuery,
  generateRequestId,
  v2Path,
  type Page,
} from '../src/platformApi.js';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

  it('returns undefined for 204 No Content', async () => {
    mockFetch(new Response(null, { status: 204 }));
    const client = new AlvaClient({ apiKey: 'k' });

    await expect(
      client._v2Request('DELETE', '/cronjobs/cronjob_0x')
    ).resolves.toBeUndefined();
  });
});

describe('Idempotency-Key', () => {
  it('gives every logical write its own UUID', async () => {
    const fn = mockFetch(json(200, {}), json(200, {}), json(200, {}));
    const client = new AlvaClient({ apiKey: 'k' });

    await client._v2Request('POST', '/search/web', { body: { query: 'a' } });
    await client._v2Request('POST', '/search/web', { body: { query: 'a' } });
    await client._v2Request('DELETE', '/cronjobs/cronjob_0x');

    const keys = [0, 1, 2].map((i) => call(fn, i).headers['Idempotency-Key']);
    for (const key of keys) expect(key).toMatch(UUID_V4);
    expect(new Set(keys).size).toBe(3);
  });

  it('sends the same key on every attempt of one write', async () => {
    const fn = mockFetch(
      problem(503, { code: 'UNAVAILABLE' }),
      json(200, { id: 'order_0x' })
    );
    const client = new AlvaClient({ apiKey: 'k' });
    const idempotencyKey = 'request-7';
    const place = () =>
      client._v2Request('POST', '/me/orders', {
        body: { symbol: 'NVDA' },
        idempotencyKey,
      });

    const first = await rejection(place());
    expect(first.code).toBe('UNAVAILABLE');
    await expect(place()).resolves.toEqual({ id: 'order_0x' });

    expect(call(fn, 0).headers['Idempotency-Key']).toBe('request-7');
    expect(call(fn, 1).headers['Idempotency-Key']).toBe('request-7');
  });
});

describe('problem parsing', () => {
  it('reads code, status, detail and requiredPermission', async () => {
    mockFetch(
      problem(403, {
        code: 'INSUFFICIENT_PERMISSION',
        detail: 'the credential lacks the trading_limits:write permission',
        requiredPermission: 'trading_limits:write',
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
    expect(err.requiredPermission).toBe('trading_limits:write');
    expect(err.invalidParams).toBeUndefined();
    expect(err.retryAfter).toBeUndefined();
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
    mockFetch(
      problem(
        429,
        { code: 'RATE_LIMITED', retryAfter: 7 },
        { 'retry-after': '30' }
      ),
      problem(429, { code: 'RATE_LIMITED' }, { 'retry-after': '30' }),
      new Response('slow down', {
        status: 429,
        headers: { 'retry-after': '12', 'content-type': 'text/plain' },
      })
    );
    const client = new AlvaClient({ apiKey: 'k' });

    expect((await rejection(client._v2Request('GET', '/a'))).retryAfter).toBe(
      7
    );
    expect((await rejection(client._v2Request('GET', '/a'))).retryAfter).toBe(
      30
    );
    const plain = await rejection(client._v2Request('GET', '/a'));
    expect(plain.code).toBe('UNKNOWN');
    expect(plain.retryAfter).toBe(12);
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

  it('prints the problem members in the CLI error, and only when present', () => {
    const withProblem = new AlvaError(
      'INVALID_ARGUMENT',
      'bad',
      400,
      undefined,
      {
        invalidParams: [{ name: 'pageSize', reason: 'must be an integer' }],
      }
    );
    expect(JSON.parse(JSON.stringify(alvaErrorOutput(withProblem)))).toEqual({
      error: {
        code: 'INVALID_ARGUMENT',
        message: 'bad',
        status: 400,
        invalidParams: [{ name: 'pageSize', reason: 'must be an integer' }],
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
