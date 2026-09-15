import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';

const REQUEST_ID = '123e4567-e89b-72d3-c456-426614174000';
const MAX_ID = '9223372036854775807';

function thesis() {
  return {
    thesis: {
      id: MAX_ID,
      author_version_id: '9223372036854775806',
      material_version_id: '9223372036854775805',
      title: 'Thesis',
      body: 'line one\r\nline two',
      entity_ids: ['9223372036854775804'],
      visibility: 'public' as const,
      closed: false,
      closing_note: '',
      author_kind: 'user',
      author_ref: 'alice',
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  };
}

describe('ThesesResource', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('uses one real HTTP boundary call and preserves CRLF and decimal IDs', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(thesis()));
    globalThis.fetch = fetch;
    const client = new AlvaClient({
      apiKey: 'key',
      baseUrl: 'https://api.test',
    });

    await expect(
      client.theses.create({
        request_id: REQUEST_ID,
        body: 'line one\r\nline two',
        title: 'Thesis',
        entity_ids: [MAX_ID],
      })
    ).resolves.toEqual(thesis());

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/v1/theses');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      request_id: REQUEST_ID,
      body: 'line one\r\nline two',
      title: 'Thesis',
      entity_ids: [MAX_ID],
      visibility: 'public',
    });
  });

  it('uses the agreed CRUD, close, delete, and explicit rewrite routes', async () => {
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    client._request = vi
      .fn()
      .mockResolvedValueOnce(thesis())
      .mockResolvedValueOnce(thesis())
      .mockResolvedValueOnce(thesis())
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ body: 'rewritten' });

    await client.theses.get(MAX_ID);
    await client.theses.update(MAX_ID, {
      request_id: REQUEST_ID,
      expected_author_version_id: '9223372036854775806',
      body: 'updated',
      visibility: 'private',
    });
    await client.theses.close(MAX_ID, {
      expected_author_version_id: '9223372036854775806',
      note: 'done',
    });
    await client.theses.delete(MAX_ID);
    await client.theses.rewrite({ body: 'draft' });

    expect(client._request.mock.calls).toEqual([
      ['GET', `/api/v1/theses/${MAX_ID}`],
      [
        'PUT',
        `/api/v1/theses/${MAX_ID}`,
        {
          body: {
            request_id: REQUEST_ID,
            expected_author_version_id: '9223372036854775806',
            body: 'updated',
            title: '',
            entity_ids: [],
            visibility: 'private',
            editorial: false,
          },
        },
      ],
      [
        'POST',
        `/api/v1/theses/${MAX_ID}/close`,
        {
          body: {
            expected_author_version_id: '9223372036854775806',
            note: 'done',
          },
        },
      ],
      ['DELETE', `/api/v1/theses/${MAX_ID}`],
      ['POST', '/api/v1/theses/rewrite', { body: { body: 'draft' } }],
    ]);
  });

  it('normalizes an actual HTTP 204 delete response to an empty object', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetch;

    await expect(
      new AlvaClient({
        apiKey: 'key',
        baseUrl: 'https://api.test',
      }).theses.delete(MAX_ID)
    ).resolves.toEqual({});
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed delete responses and preserves request errors', async () => {
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    client._request = vi.fn().mockResolvedValue({ deleted: true });

    await expect(client.theses.delete(MAX_ID)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });

    const error = new AlvaError('UNAVAILABLE', 'backend down', 503);
    client._request.mockRejectedValueOnce(error);
    await expect(client.theses.delete(MAX_ID)).rejects.toBe(error);
  });

  it('rejects any numeric response ID instead of losing int64 precision', async () => {
    const response = thesis() as { thesis: Record<string, unknown> };
    response.thesis.id = 9_007_199_254_740_992;
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(response));

    await expect(
      new AlvaClient({ apiKey: 'key' }).theses.get(MAX_ID)
    ).rejects.toMatchObject({
      name: 'AlvaError',
      code: 'INVALID_RESPONSE',
    });
  });

  it.each([
    ['blank body', { body: ' \r\n\t' }],
    ['oversize body', { body: 'a'.repeat(65_537) }],
    ['NUL body', { body: 'draft\0body' }],
    ['oversize title', { title: 'a'.repeat(501) }],
    ['NUL title', { title: 'thesis\0title' }],
  ])('rejects %s in a CRUD thesis response', async (_name, patch) => {
    const response = thesis() as { thesis: Record<string, unknown> };
    Object.assign(response.thesis, patch);
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    client._request = vi.fn().mockResolvedValue(response);

    await expect(client.theses.get(MAX_ID)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('does not retry a stable request ID after a backend HTTP error', async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: { code: 'UNAVAILABLE', message: 'backend down' },
        },
        503
      )
    );
    globalThis.fetch = fetch;

    await expect(
      new AlvaClient({ apiKey: 'key' }).theses.create({
        request_id: REQUEST_ID,
        body: 'draft',
      })
    ).rejects.toBeInstanceOf(AlvaError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['zero ID', { request_id: REQUEST_ID, body: 'draft', entity_ids: ['0'] }],
    [
      'negative ID',
      { request_id: REQUEST_ID, body: 'draft', entity_ids: ['-1'] },
    ],
    [
      'overflow ID',
      {
        request_id: REQUEST_ID,
        body: 'draft',
        entity_ids: ['9223372036854775808'],
      },
    ],
    [
      'more than 20 entity IDs',
      {
        request_id: REQUEST_ID,
        body: 'draft',
        entity_ids: Array.from({ length: 21 }, (_, index) => String(index + 1)),
      },
    ],
    ['blank body', { request_id: REQUEST_ID, body: ' \r\n\t' }],
    ['body NUL', { request_id: REQUEST_ID, body: 'draft\0body' }],
    ['title NUL', { request_id: REQUEST_ID, body: 'draft', title: 'a\0b' }],
    [
      'body over 65536 bytes',
      { request_id: REQUEST_ID, body: 'a'.repeat(65_537) },
    ],
    [
      'title over 500 bytes',
      { request_id: REQUEST_ID, body: 'draft', title: 'a'.repeat(501) },
    ],
    [
      'unsupported visibility',
      { request_id: REQUEST_ID, body: 'draft', visibility: 'paid' as never },
    ],
  ])('rejects %s before the HTTP boundary', async (_name, params) => {
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    client._request = vi.fn();

    await expect(client.theses.create(params)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    expect(client._request).not.toHaveBeenCalled();
  });

  it('rejects NUL in a close note before the HTTP boundary', async () => {
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    client._request = vi.fn();

    await expect(
      client.theses.close(MAX_ID, {
        expected_author_version_id: '9223372036854775806',
        note: 'done\0now',
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(client._request).not.toHaveBeenCalled();
  });

  it.each(['', ' \r\n', 'a'.repeat(65_537)])(
    'rejects invalid rewrite output at the SDK boundary',
    async (body) => {
      const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
        _request: ReturnType<typeof vi.fn>;
      };
      client._request = vi.fn().mockResolvedValue({ body });

      await expect(
        client.theses.rewrite({ body: 'draft' })
      ).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      });
    }
  );
});
