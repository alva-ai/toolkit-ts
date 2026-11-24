import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';

const REQUEST_ID = '123e4567-e89b-72d3-c456-426614174000';
const MAX_ID = '9223372036854775807';

function thesis(visibility: 'public' | 'private' = 'public') {
  return {
    thesis: {
      id: MAX_ID,
      author_version_id: '9223372036854775806',
      material_version_id: '9223372036854775805',
      title: 'Thesis',
      body: 'line one\r\nline two',
      entity_ids: ['9223372036854775804'],
      visibility,
      closed: false,
      archived: false,
      closing_note: '',
      author_kind: 'user',
      author_ref: 'alice',
    },
  };
}

function thesisGet() {
  return {
    ...thesis(),
    author: {
      id: '42',
      kind: 'user',
      display_name: 'Alice',
      avatar_url: 'https://example.com/alice.png',
      username: 'alice',
    },
    entities: [
      {
        id: '9223372036854775804',
        ticker: 'NVDA',
        name: 'NVIDIA Corporation',
        icon_url: 'https://example.com/nvda.svg',
        kind: 'STOCK',
      },
    ],
  };
}

function thesisSignals() {
  return {
    research: { state: 'partial', pending_work: 2, read_complete: false },
    entries: [
      {
        feed_entry_id: '77',
        cursor: 'cursor-77',
        signal: {
          id: '88',
          thesis_id: MAX_ID,
          author_version_id: '9223372036854775806',
          statement_snapshot: 'NVDA compounds',
          stance: 'supports',
          explanation: 'evidence',
          information_kind: 'fact',
          evidence_excerpt: {
            text: 'exact passage',
            omitted_before: false,
            omitted_after: true,
          },
          source: {
            title: 'Source',
            url: 'https://example.test/a',
            published_at_ms: 1725811000000,
          },
        },
      },
    ],
    next_cursor: 'cursor-77',
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
        tickers: ['NVDA', 'AAPL'],
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
      tickers: ['NVDA', 'AAPL'],
      visibility: 'public',
    });
  });

  it('omits the optional tickers field when the caller does not supply it', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(thesis()));
    globalThis.fetch = fetch;
    const client = new AlvaClient({
      apiKey: 'key',
      baseUrl: 'https://api.test',
    });

    await client.theses.create({ request_id: REQUEST_ID, body: 'view' });

    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty('tickers');
  });

  it('extracts asset candidates and sends the confirmed stance on creation', async () => {
    const response = {
      data: {
        viewer: {
          thesisAssetCandidates: {
            mentions: [
              {
                quote: '英伟达',
                ticker: 'NVDA',
                resolution: 'RESOLVED',
                stance: 'BEARISH',
                candidates: [
                  {
                    entityId: '745337',
                    ticker: 'NVDA',
                    name: 'NVIDIA',
                    kind: 'STOCK',
                  },
                ],
              },
            ],
            returnPreview: null,
          },
        },
      },
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(response))
      .mockResolvedValueOnce(jsonResponse(thesis()));
    globalThis.fetch = fetch;
    const client = new AlvaClient({
      apiKey: 'key',
      baseUrl: 'https://api.test',
    });
    const candidates = await client.theses.assetCandidates('看跌英伟达');
    expect(candidates.mentions[0]?.stance).toBe('BEARISH');
    expect(candidates.mentions[0]?.candidates[0]?.entityId).toBe('745337');
    const [queryUrl, queryInit] = fetch.mock.calls[0] as [string, RequestInit];
    expect(queryUrl).toBe('https://api.test/query');
    expect(JSON.parse(queryInit.body as string).variables).toEqual({
      input: { text: '看跌英伟达', selectedEntityIds: [] },
    });

    await client.theses.create({
      request_id: REQUEST_ID,
      body: '看跌英伟达',
      entity_ids: ['745337'],
      entity_stances: [{ entity_id: '745337', stance: 'bearish' }],
    });
    const [, createInit] = fetch.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(createInit.body as string).entity_stances).toEqual([
      { entity_id: '745337', stance: 'bearish' },
    ]);
  });

  it('rejects a direction that is not tied to a supplied entity', async () => {
    const client = new AlvaClient({ apiKey: 'key' });
    await expect(
      client.theses.create({
        request_id: REQUEST_ID,
        body: '看跌英伟达',
        tickers: ['NVDA'],
        entity_stances: [{ entity_id: '745337', stance: 'bearish' }],
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('rejects extracted entity IDs outside signed int64', async () => {
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    client._request = vi.fn().mockResolvedValue({
      data: {
        viewer: {
          thesisAssetCandidates: {
            mentions: [
              {
                quote: 'NVDA',
                ticker: 'NVDA',
                resolution: 'RESOLVED',
                stance: 'BEARISH',
                candidates: [
                  {
                    entityId: '9223372036854775808',
                    ticker: 'NVDA',
                    name: 'NVIDIA',
                    kind: 'STOCK',
                  },
                ],
              },
            ],
          },
        },
      },
    });
    await expect(client.theses.assetCandidates('NVDA')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('lists enriched Signal history through the Thesis REST resource', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(thesisSignals()));
    globalThis.fetch = fetch;
    const client = new AlvaClient({
      apiKey: 'key',
      baseUrl: 'https://api.test',
    });

    await expect(
      client.theses.signals(MAX_ID, { first: 1, cursor: 'after' })
    ).resolves.toEqual(thesisSignals());
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.test/api/v1/theses/9223372036854775807/signals?first=1&cursor=after'
    );
    expect(init.method).toBe('GET');
  });

  it('gets one exact author version without falling back to the current version', async () => {
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    client._request = vi.fn().mockResolvedValue(thesis());

    await expect(
      client.theses.getVersion(MAX_ID, '9223372036854775806')
    ).resolves.toEqual(thesis());
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      `/api/v1/theses/${MAX_ID}/versions/9223372036854775806`
    );
  });

  it('accepts 100 entity IDs in a request and a response', async () => {
    const ids = Array.from({ length: 100 }, (_, index) => String(index + 1));
    const response = thesis();
    response.thesis.entity_ids = ids;
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    client._request = vi.fn().mockResolvedValue(response);

    await expect(
      client.theses.create({
        request_id: REQUEST_ID,
        body: 'draft',
        entity_ids: ids,
        entity_stances: ids.map((entity_id) => ({
          entity_id,
          stance: 'bearish' as const,
        })),
      })
    ).resolves.toEqual(response);
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/theses',
      expect.objectContaining({
        body: expect.objectContaining({
          entity_stances: expect.arrayContaining([
            { entity_id: '100', stance: 'bearish' },
          ]),
        }),
      })
    );
  });

  it('rejects a response with more than 100 entity IDs', async () => {
    const response = thesis();
    response.thesis.entity_ids = Array.from({ length: 101 }, (_, index) =>
      String(index + 1)
    );
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    client._request = vi.fn().mockResolvedValue(response);

    await expect(
      client.theses.getVersion(MAX_ID, '9223372036854775806')
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('rejects an exact-version response that does not match the requested version', async () => {
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    client._request = vi.fn().mockResolvedValue(thesis());

    await expect(client.theses.getVersion(MAX_ID, '42')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it.each([0, 51, 1.5])(
    'rejects invalid Signal page size %s before HTTP',
    async (first) => {
      const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
        _request: ReturnType<typeof vi.fn>;
      };
      client._request = vi.fn();
      await expect(
        client.theses.signals(MAX_ID, { first })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
      expect(client._request).not.toHaveBeenCalled();
    }
  );

  it('rejects a Signal response for another Thesis', async () => {
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    const response = thesisSignals();
    response.entries[0].signal.thesis_id = '42';
    client._request = vi.fn().mockResolvedValue(response);
    await expect(client.theses.signals(MAX_ID)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('uses the agreed CRUD, close, delete, and explicit rewrite routes', async () => {
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    client._request = vi
      .fn()
      .mockResolvedValueOnce(thesisGet())
      .mockResolvedValueOnce(thesis('private'))
      .mockResolvedValueOnce(thesis())
      .mockResolvedValueOnce({ body: 'rewritten' });

    await client.theses.get(MAX_ID);
    await client.theses.setVisibility(MAX_ID, { visibility: 'private' });
    await client.theses.update(MAX_ID, {
      request_id: REQUEST_ID,
      expected_author_version_id: '9223372036854775806',
      body: 'updated',
      visibility: 'private',
    });
    await client.theses.rewrite({ body: 'draft' });

    expect(client._request.mock.calls).toEqual([
      ['GET', `/api/v1/theses/${MAX_ID}`],
      [
        'POST',
        `/api/v1/theses/${MAX_ID}/visibility`,
        { body: { visibility: 'private' } },
      ],
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
          },
        },
      ],
      [
        'POST',
        '/api/v1/theses/rewrite',
        { body: { body: 'draft', mode: 'reformat' } },
      ],
    ]);
  });

  it('archives the current version with its fields and expected version', async () => {
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    const current = thesisGet();
    current.thesis.archived = false;
    current.thesis.entity_stances = [
      { entity_id: '9223372036854775804', stance: 'bullish' },
    ];
    const archived = thesis();
    archived.thesis.archived = true;
    archived.thesis.entity_stances = current.thesis.entity_stances;
    client._request = vi
      .fn()
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(archived);

    await expect(
      client.theses.setArchived(MAX_ID, {
        request_id: REQUEST_ID,
        archived: true,
        note: 'review later',
      })
    ).resolves.toEqual(archived);
    expect(client._request).toHaveBeenNthCalledWith(
      2,
      'PUT',
      `/api/v1/theses/${MAX_ID}`,
      {
        body: {
          request_id: REQUEST_ID,
          expected_author_version_id: current.thesis.author_version_id,
          body: current.thesis.body,
          title: current.thesis.title,
          entity_ids: current.thesis.entity_ids,
          entity_stances: current.thesis.entity_stances,
          visibility: current.thesis.visibility,
          archived: true,
          note: 'review later',
        },
      }
    );
  });

  it('keeps an idempotent archive no-op without requiring directions', async () => {
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    const current = thesisGet();
    current.thesis.archived = false;
    client._request = vi.fn().mockResolvedValue(current);

    await expect(
      client.theses.setArchived(MAX_ID, {
        request_id: REQUEST_ID,
        archived: false,
      })
    ).resolves.toEqual({ thesis: current.thesis });
    expect(client._request).toHaveBeenCalledTimes(1);
  });

  it('rejects an archive update when directions do not cover every entity', async () => {
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    const current = thesisGet();
    current.thesis.archived = false;
    current.thesis.entity_ids = ['1', '2'];
    current.thesis.entity_stances = [{ entity_id: '1', stance: 'bullish' }];
    client._request = vi.fn().mockResolvedValue(current);

    await expect(
      client.theses.setArchived(MAX_ID, {
        request_id: REQUEST_ID,
        archived: true,
      })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(client._request).toHaveBeenCalledTimes(1);
  });

  it('allows an archive update for a Thesis with no entities and no directions', async () => {
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    const current = thesisGet();
    current.thesis.archived = false;
    current.thesis.entity_ids = [];
    current.entities = [];
    delete current.thesis.entity_stances;
    const archived = thesis();
    archived.thesis.archived = true;
    archived.thesis.entity_ids = [];
    client._request = vi
      .fn()
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(archived);

    await expect(
      client.theses.setArchived(MAX_ID, {
        request_id: REQUEST_ID,
        archived: true,
      })
    ).resolves.toEqual(archived);
    expect(client._request).toHaveBeenCalledTimes(2);
  });

  it('maps bookmark and Signal research mutations with authoritative state', async () => {
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    client._request = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          setThesisStarred: {
            thesisId: MAX_ID,
            stats: { starCount: 17 },
            viewerState: { isStarred: true },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          setThesisSignalEnabled: {
            publication: {
              playbookId: MAX_ID,
              authorVersionId: '9223372036854775804',
              archived: false,
              researchPaused: false,
            },
          },
        },
      });

    await expect(client.theses.setStarred(MAX_ID, true)).resolves.toEqual({
      thesis_id: MAX_ID,
      star_count: 17,
      is_starred: true,
    });
    await expect(client.theses.setSignalEnabled(MAX_ID, true)).resolves.toEqual(
      {
        thesis_id: MAX_ID,
        author_version_id: '9223372036854775804',
        archived: false,
        research_paused: false,
        enabled: true,
      }
    );
    expect(client._request).toHaveBeenNthCalledWith(
      1,
      'POST',
      '/query',
      expect.objectContaining({
        body: expect.objectContaining({
          variables: { input: { thesisId: MAX_ID, isStarred: true } },
        }),
      })
    );
    expect(client._request).toHaveBeenNthCalledWith(
      2,
      'POST',
      '/query',
      expect.objectContaining({
        body: expect.objectContaining({
          variables: { input: { thesisId: MAX_ID, enabled: true } },
        }),
      })
    );
  });

  it('normalizes noncanonical GraphQL mutation errors', async () => {
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    client._request = vi
      .fn()
      .mockResolvedValueOnce({
        errors: [{ message: 'internal', extensions: { code: 'INTERNAL' } }],
      })
      .mockResolvedValueOnce({
        errors: [
          { message: 'missing', extensions: { code: 'NOT_FOUND' } },
          { message: 'internal', extensions: { code: 'INTERNAL' } },
        ],
      });

    await expect(client.theses.setStarred(MAX_ID, true)).rejects.toMatchObject({
      code: 'GRAPHQL_ERROR',
      status: 400,
    });
    await expect(
      client.theses.setSignalEnabled(MAX_ID, true)
    ).rejects.toMatchObject({
      code: 'GRAPHQL_ERROR',
      status: 400,
    });
  });

  it('rejects invalid visibility requests and mismatched responses', async () => {
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    client._request = vi.fn();

    await expect(
      client.theses.setVisibility('0', { visibility: 'private' })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(
      client.theses.setVisibility(MAX_ID, { visibility: 'paid' as never })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(
      client.theses.setVisibility(MAX_ID, undefined as never)
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(client._request).not.toHaveBeenCalled();

    client._request.mockResolvedValueOnce(thesis());
    await expect(
      client.theses.setVisibility(MAX_ID, { visibility: 'private' })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });

    const wrongID = thesis('private') as { thesis: Record<string, unknown> };
    wrongID.thesis.id = '1';
    client._request.mockResolvedValueOnce(wrongID);
    await expect(
      client.theses.setVisibility(MAX_ID, { visibility: 'private' })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
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
    ['NUL closing note', { closing_note: 'done\0unsafe' }],
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
      'more than 100 entity IDs',
      {
        request_id: REQUEST_ID,
        body: 'draft',
        entity_ids: Array.from({ length: 101 }, (_, index) =>
          String(index + 1)
        ),
      },
    ],
    ['blank body', { request_id: REQUEST_ID, body: ' \r\n\t' }],
    ['blank ticker', { request_id: REQUEST_ID, body: 'draft', tickers: [' '] }],
    [
      'ticker NUL',
      { request_id: REQUEST_ID, body: 'draft', tickers: ['A\0B'] },
    ],
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

  it.each(['reformat', 'shorten', 'enrich'] as const)(
    'sends canonical rewrite mode %s exactly once',
    async (mode) => {
      const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
        _request: ReturnType<typeof vi.fn>;
      };
      client._request = vi.fn().mockResolvedValue({ body: 'candidate' });

      await expect(
        client.theses.rewrite({ body: 'draft', mode })
      ).resolves.toEqual({
        body: 'candidate',
      });
      expect(client._request).toHaveBeenCalledTimes(1);
      expect(client._request).toHaveBeenCalledWith(
        'POST',
        '/api/v1/theses/rewrite',
        { body: { body: 'draft', mode } }
      );
    }
  );

  it('sends reformat when rewrite mode is omitted', async () => {
    const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
    };
    client._request = vi.fn().mockResolvedValue({ body: 'candidate' });

    await client.theses.rewrite({ body: 'draft' });

    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/theses/rewrite',
      { body: { body: 'draft', mode: 'reformat' } }
    );
  });

  it.each(['', ' ', 'rewrite', null])(
    'rejects invalid rewrite mode %j without an HTTP request',
    async (mode) => {
      const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
        _request: ReturnType<typeof vi.fn>;
      };
      client._request = vi.fn();

      await expect(
        client.theses.rewrite({ body: 'draft', mode: mode as never })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
      expect(client._request).not.toHaveBeenCalled();
    }
  );
});

describe('Thesis return preview and switch (2026-11-16-thesis-agent-return-preview)', () => {
  const client = () =>
    new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });

  it('asks for directions of known tickers without discovery and parses the preview', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        data: {
          viewer: {
            thesisAssetCandidates: {
              mentions: [],
              returnPreview: {
                tracking: 'ON',
                askSwitch: false,
                directions: [{ entityId: '745337', direction: 'BULLISH' }],
                keptEntityIds: ['745337'],
                lastLegRemoved: false,
              },
            },
          },
        },
      })
    );
    globalThis.fetch = fetch;
    const got = await client().theses.assetCandidates('平仓英伟达', {
      entityIds: ['745337'],
      thesisId: '9451',
      discover: false,
    });
    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).variables).toEqual({
      input: {
        text: '平仓英伟达',
        selectedEntityIds: ['745337'],
        thesisId: '9451',
        discover: false,
      },
    });
    expect(got.returnPreview).toEqual({
      tracking: 'ON',
      askSwitch: false,
      directions: [{ entityId: '745337', direction: 'BULLISH' }],
      keptEntityIds: ['745337'],
      lastLegRemoved: false,
    });
  });

  it('rejects an invalid preview', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        data: {
          viewer: {
            thesisAssetCandidates: {
              mentions: [],
              returnPreview: { tracking: 'MAYBE' },
            },
          },
        },
      })
    );
    await expect(
      client().theses.assetCandidates('x', { discover: false })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('sends track_return and none only when given', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(thesis()));
    globalThis.fetch = fetch;
    await client().theses.create({
      request_id: REQUEST_ID,
      body: 'statement',
      entity_ids: ['745337'],
      entity_stances: [{ entity_id: '745337', stance: 'none' }],
      track_return: false,
    });
    const [, createInit] = fetch.mock.calls[0] as [string, RequestInit];
    const created = JSON.parse(createInit.body as string);
    expect(created.track_return).toBe(false);
    expect(created.entity_stances).toEqual([
      { entity_id: '745337', stance: 'none' },
    ]);
    await client().theses.create({ request_id: REQUEST_ID, body: 'statement' });
    const [, plainInit] = fetch.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(plainInit.body as string)).not.toHaveProperty(
      'track_return'
    );
  });

  it('keeps the typed reason of a REST rejection', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'FAILED_PRECONDITION', message: 'must keep a ticker' },
          details: {
            domain: 'alva.ai/thesis',
            reason: 'THESIS_RETURN_LAST_LEG',
          },
        }),
        { status: 412, headers: { 'content-type': 'application/json' } }
      )
    );
    await expect(
      client().theses.create({ request_id: REQUEST_ID, body: 'statement' })
    ).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
      status: 412,
      details: { domain: 'alva.ai/thesis', reason: 'THESIS_RETURN_LAST_LEG' },
    });
  });

  const returnResponse = (update: Record<string, unknown> = {}) =>
    jsonResponse({
      data: {
        node: {
          latestRelease: {
            thesisPublication: {
              returnTracking: 'ON',
              thesisReturn: {
                live: true,
                value: 0.25,
                firstFillAtMs: 1,
                pricedAtMs: 2,
                stale: false,
                computedAtMs: 3,
                updates: [
                  {
                    authorVersionId: '15691',
                    publishedAtMs: 1,
                    startValue: 0,
                    updateReturn: 0.25,
                    positions: [
                      {
                        entityId: '745337',
                        symbol: 'NVDA',
                        direction: 'BEARISH',
                        startPrice: 216.38,
                        startAtMs: 1,
                        endPrice: 161.01,
                        endAtMs: 2,
                        end: 'LATEST',
                        positionReturn: 0.25,
                        currency: 'USD',
                        weight: 1,
                      },
                    ],
                    ...update,
                  },
                ],
                allocation: null,
              },
            },
          },
        },
      },
    });

  it('reads the Thesis return of the current publication', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(returnResponse());
    globalThis.fetch = fetch;
    const got = await client().theses.thesisReturn('9451', { detail: true });
    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).variables).toEqual({
      id: 'Playbook:9451',
      detail: true,
    });
    expect(got.returnTracking).toBe('ON');
    expect(got.thesisReturn?.updates[0]?.positions[0]?.symbol).toBe('NVDA');
    await expect(client().theses.thesisReturn('x')).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });

  const watchpointsResponse = (publication: unknown) =>
    jsonResponse({
      data: { node: { latestRelease: { thesisPublication: publication } } },
    });

  it('reads the current watchpoints of a Thesis', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(
      watchpointsResponse({
        watchpoints: [
          { label: 'W1', text: 'AI capex peaks', origin: 'stated' },
          { label: 'W4', text: 'Export rules tighten', origin: 'inferred' },
        ],
      })
    );
    globalThis.fetch = fetch;
    const got = await client().theses.watchpoints('9451');
    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.variables).toEqual({ id: 'Playbook:9451' });
    expect(body.query).toContain('watchpoints { label text origin }');
    expect(got).toEqual({
      playbookId: '9451',
      watchpoints: [
        { label: 'W1', text: 'AI capex peaks', origin: 'stated' },
        { label: 'W4', text: 'Export rules tighten', origin: 'inferred' },
      ],
    });
    await expect(client().theses.watchpoints('x')).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });

  it('returns no watchpoints without a readable publication and fails closed on a malformed entry', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(watchpointsResponse(null));
    expect(await client().theses.watchpoints('9451')).toEqual({
      playbookId: '9451',
      watchpoints: [],
    });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { node: null } }));
    await expect(client().theses.watchpoints('9451')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      watchpointsResponse({
        watchpoints: [{ label: 'W1', text: 'x', origin: 'guessed' }],
      })
    );
    await expect(client().theses.watchpoints('9451')).rejects.toMatchObject({
      code: 'GRAPHQL_INVALID_RESPONSE',
    });
  });

  it('rejects a Thesis return Update without its publication time', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(returnResponse({ publishedAtMs: null }));
    await expect(client().theses.thesisReturn('9451')).rejects.toMatchObject({
      code: 'GRAPHQL_INVALID_RESPONSE',
    });
  });
});
