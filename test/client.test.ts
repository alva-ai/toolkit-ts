import { describe, it, expect, vi, afterEach } from 'vitest';
import { AlvaClient } from '../src/client.js';
import { AlvaError } from '../src/error.js';

// Helper to create a mock fetch
function mockFetch(response: {
  ok?: boolean;
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  throwError?: Error;
}): ReturnType<typeof vi.fn> {
  const { ok = true, status = 200, headers = {}, body, throwError } = response;
  const fn = vi.fn();
  if (throwError) {
    fn.mockRejectedValue(throwError);
  } else {
    const headerMap = new Map(Object.entries(headers));
    fn.mockResolvedValue({
      ok,
      status,
      headers: {
        get: (key: string) => headerMap.get(key.toLowerCase()) ?? null,
      },
      json: () => Promise.resolve(body),
      text: () =>
        Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });
  }
  return fn;
}

describe('AlvaClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('sets default base URL', () => {
      const client = new AlvaClient({});
      expect(client.baseUrl).toBe('https://api-llm.prd.alva.ai');
    });

    it('uses custom base URL', () => {
      const client = new AlvaClient({ baseUrl: 'http://localhost:8080' });
      expect(client.baseUrl).toBe('http://localhost:8080');
    });

    it('stores apiKey', () => {
      const client = new AlvaClient({ apiKey: 'test-key' });
      expect(client.apiKey).toBe('test-key');
    });

    it('arraysBaseUrl defaults to https://data-tools.prd.space.id', () => {
      const client = new AlvaClient({ apiKey: 'k' });
      expect(client.arraysBaseUrl).toBe('https://data-tools.prd.space.id');
    });

    it('arraysBaseUrl uses config value when provided', () => {
      const client = new AlvaClient({
        apiKey: 'k',
        arraysBaseUrl: 'https://custom.example',
      });
      expect(client.arraysBaseUrl).toBe('https://custom.example');
    });
  });

  describe('_request', () => {
    it('sends GET with query params', async () => {
      const fetch = mockFetch({ body: { id: 1 } });
      globalThis.fetch = fetch;
      const client = new AlvaClient({});

      await client._request('GET', '/api/v1/me');

      expect(fetch).toHaveBeenCalledTimes(1);
      const [url] = fetch.mock.calls[0];
      expect(url).toBe('https://api-llm.prd.alva.ai/api/v1/me');
    });

    it('sends GET with query params appended', async () => {
      const fetch = mockFetch({ body: {} });
      globalThis.fetch = fetch;
      const client = new AlvaClient({});

      await client._request('GET', '/api/v1/fs/read', {
        query: { path: '~/data/f.json', size: 100 },
      });

      const [url] = fetch.mock.calls[0];
      expect(url).toContain('path=%7E%2Fdata%2Ff.json');
      expect(url).toContain('size=100');
    });

    it('sends POST with JSON body', async () => {
      const fetch = mockFetch({ body: { result: 'ok' } });
      globalThis.fetch = fetch;
      const client = new AlvaClient({});

      await client._request('POST', '/api/v1/run', {
        body: { code: '1+1' },
      });

      const [, init] = fetch.mock.calls[0];
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(init.body)).toEqual({ code: '1+1' });
    });

    it('sends POST with raw JSON body', async () => {
      const fetch = mockFetch({ body: { result: 'ok' } });
      globalThis.fetch = fetch;
      const client = new AlvaClient({});
      const body =
        '{"session_id":2047213140224270336,"target_type":"feed","target_id":8169}';

      await client._request('POST', '/api/v1/channel/group-subscriptions', {
        jsonBody: body,
      });

      const [, init] = fetch.mock.calls[0];
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.body).toBe(body);
    });

    it('sends POST with rawBody as octet-stream', async () => {
      const fetch = mockFetch({ body: { bytes_written: 3 } });
      globalThis.fetch = fetch;
      const client = new AlvaClient({ apiKey: 'key' });

      const data = new Uint8Array([1, 2, 3]);
      await client._request('POST', '/api/v1/fs/write', {
        query: { path: '~/f' },
        rawBody: data,
      });

      const [url, init] = fetch.mock.calls[0];
      expect(url).toContain('path=%7E%2Ff');
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/octet-stream');
      expect(init.body).toBe(data);
    });

    it('adds X-Alva-Api-Key header when apiKey is set', async () => {
      const fetch = mockFetch({ body: {} });
      globalThis.fetch = fetch;
      const client = new AlvaClient({ apiKey: 'my-key' });

      await client._request('GET', '/api/v1/me');

      const [, init] = fetch.mock.calls[0];
      expect(init.headers['X-Alva-Api-Key']).toBe('my-key');
    });

    it('omits auth header when apiKey is absent', async () => {
      const fetch = mockFetch({ body: {} });
      globalThis.fetch = fetch;
      const client = new AlvaClient({});

      await client._request('GET', '/api/v1/fs/read', {
        query: { path: '/alva/home/alice/data.json' },
      });

      const [, init] = fetch.mock.calls[0];
      expect(init.headers['X-Alva-Api-Key']).toBeUndefined();
    });

    it('parses JSON response', async () => {
      const fetch = mockFetch({
        body: { id: 42, username: 'alice' },
        headers: { 'content-type': 'application/json' },
      });
      globalThis.fetch = fetch;
      const client = new AlvaClient({});

      const result = await client._request('GET', '/api/v1/me');
      expect(result).toEqual({ id: 42, username: 'alice' });
    });

    it('returns ArrayBuffer for binary response', async () => {
      const fetch = mockFetch({
        headers: { 'content-type': 'application/octet-stream' },
      });
      globalThis.fetch = fetch;
      const client = new AlvaClient({});

      const result = await client._request('GET', '/api/v1/screenshot');
      expect(result).toBeInstanceOf(ArrayBuffer);
    });

    it('returns ArrayBuffer for image/png response', async () => {
      const fetch = mockFetch({
        headers: { 'content-type': 'image/png' },
      });
      globalThis.fetch = fetch;
      const client = new AlvaClient({});

      const result = await client._request('GET', '/api/v1/screenshot');
      expect(result).toBeInstanceOf(ArrayBuffer);
    });

    it('wraps network error as AlvaError', async () => {
      const fetch = mockFetch({ throwError: new TypeError('Failed to fetch') });
      globalThis.fetch = fetch;
      const client = new AlvaClient({});

      await expect(client._request('GET', '/api/v1/me')).rejects.toThrow(
        AlvaError
      );
      try {
        await client._request('GET', '/api/v1/me');
      } catch (e) {
        expect(e).toBeInstanceOf(AlvaError);
        expect((e as AlvaError).code).toBe('NETWORK_ERROR');
      }
    });

    it('parses API error envelope', async () => {
      const fetch = mockFetch({
        ok: false,
        status: 404,
        headers: { 'content-type': 'application/json' },
        body: { error: { code: 'NOT_FOUND', message: 'File not found' } },
      });
      globalThis.fetch = fetch;
      const client = new AlvaClient({ apiKey: 'key' });

      try {
        await client._request('GET', '/api/v1/fs/stat');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(AlvaError);
        expect((e as AlvaError).code).toBe('NOT_FOUND');
        expect((e as AlvaError).message).toBe('File not found');
        expect((e as AlvaError).status).toBe(404);
      }
    });

    it('handles non-JSON error response', async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        headers: {
          get: (key: string) =>
            key.toLowerCase() === 'content-type' ? 'text/html' : null,
        },
        text: () => Promise.resolve('<html>Bad Gateway</html>'),
        json: () => Promise.reject(new Error('not json')),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });
      globalThis.fetch = fetch;
      const client = new AlvaClient({ apiKey: 'key' });

      try {
        await client._request('GET', '/api/v1/me');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(AlvaError);
        expect((e as AlvaError).code).toBe('UNKNOWN');
        expect((e as AlvaError).status).toBe(502);
      }
    });

    it('handles JSON error without error envelope', async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: {
          get: (key: string) =>
            key.toLowerCase() === 'content-type' ? 'application/json' : null,
        },
        text: () => Promise.resolve('{"message":"bad request"}'),
        json: () => Promise.resolve({ message: 'bad request' }),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });
      globalThis.fetch = fetch;
      const client = new AlvaClient({ apiKey: 'key' });

      try {
        await client._request('POST', '/api/v1/run');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(AlvaError);
        expect((e as AlvaError).code).toBe('UNKNOWN');
        expect((e as AlvaError).status).toBe(400);
        expect((e as AlvaError).message).toContain('bad request');
      }
    });

    it('_request sends to override baseUrl when options.baseUrl is set', async () => {
      const fetch = mockFetch({ body: {} });
      globalThis.fetch = fetch;
      const client = new AlvaClient({ apiKey: 'k' });

      await client._request('GET', '/v1/skills', {
        baseUrl: 'https://data-tools.prd.space.id',
      });

      const [url] = fetch.mock.calls[0];
      expect(url).toBe('https://data-tools.prd.space.id/v1/skills');
    });

    it('_request does not send X-Alva-Api-Key when noAuth is true', async () => {
      const fetch = mockFetch({ body: {} });
      globalThis.fetch = fetch;
      const client = new AlvaClient({ apiKey: 'my-key' });

      await client._request('GET', '/v1/skills', { noAuth: true });

      const [, init] = fetch.mock.calls[0];
      expect(init.headers['X-Alva-Api-Key']).toBeUndefined();
    });

    it('_request does not send x-Playbook-Viewer when noAuth is true', async () => {
      const fetch = mockFetch({ body: {} });
      globalThis.fetch = fetch;
      const client = new AlvaClient({ viewer_token: 'vtok' });

      await client._request('GET', '/v1/skills', { noAuth: true });

      const [, init] = fetch.mock.calls[0];
      expect(init.headers['x-Playbook-Viewer']).toBeUndefined();
    });

    it('_request still sends X-Alva-Api-Key by default (no noAuth)', async () => {
      const fetch = mockFetch({ body: {} });
      globalThis.fetch = fetch;
      const client = new AlvaClient({ apiKey: 'my-key' });

      await client._request('GET', '/api/v1/me');

      const [, init] = fetch.mock.calls[0];
      expect(init.headers['X-Alva-Api-Key']).toBe('my-key');
    });

    it('_request honors both baseUrl and noAuth together', async () => {
      const fetch = mockFetch({ body: {} });
      globalThis.fetch = fetch;
      const client = new AlvaClient({ apiKey: 'my-key' });

      await client._request('GET', '/v1/skills', {
        baseUrl: 'https://data-tools.prd.space.id',
        noAuth: true,
      });

      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe('https://data-tools.prd.space.id/v1/skills');
      expect(init.headers['X-Alva-Api-Key']).toBeUndefined();
      expect(init.headers['x-Playbook-Viewer']).toBeUndefined();
    });

    it('omits undefined query params', async () => {
      const fetch = mockFetch({ body: {} });
      globalThis.fetch = fetch;
      const client = new AlvaClient({});

      await client._request('GET', '/api/v1/fs/read', {
        query: { path: '~/f', offset: undefined, size: undefined },
      });

      const [url] = fetch.mock.calls[0];
      expect(url).not.toContain('offset');
      expect(url).not.toContain('size');
    });
  });

  describe('_requireAuth', () => {
    it('throws AlvaError when apiKey is absent', () => {
      const client = new AlvaClient({});
      expect(() => client._requireAuth()).toThrow(AlvaError);
      try {
        client._requireAuth();
      } catch (e) {
        expect((e as AlvaError).code).toBe('UNAUTHENTICATED');
      }
    });

    it('does not throw when apiKey is present', () => {
      const client = new AlvaClient({ apiKey: 'key' });
      expect(() => client._requireAuth()).not.toThrow();
    });
  });

  describe('AlvaError', () => {
    it('is instanceof Error', () => {
      const err = new AlvaError('NOT_FOUND', 'not found', 404);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AlvaError);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.message).toBe('not found');
      expect(err.status).toBe(404);
      expect(err.name).toBe('AlvaError');
    });
  });
});
