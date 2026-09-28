import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import type {
  ForYouListParams,
  ForYouThesesParams,
} from '../../src/resources/forYou.js';
import { dispatch as terminal } from '../../src/cli/index.js';
import { dispatch as embedded } from '../../src/cli/embeddedDispatch.js';
import { CliUsageError } from '../../src/error.js';

const id = '9223372036854775807';
function page(body = 'Full **card** content') {
  return {
    edges: [
      {
        cursor: 'opaque:newest',
        node: {
          id: `FeedEntry:${id}`,
          feed: { id },
          major: { id: `${id}:1`, feedId: id, number: 1 },
          displayName: null,
          source: 'company-events',
          title: 'Compute commitments',
          body,
          eventTimeMs: 1788710000000,
          publishedAtMs: 1788710100000,
          actions: [
            {
              type: 'OPEN_URL',
              label: 'Source',
              url: 'https://example.com',
              prompt: null,
            },
          ],
          presentation: null,
          tickers: [],
          media: [],
          sources: [
            {
              type: 'WEB',
              title: 'Primary source',
              url: 'https://example.com',
              iconUrl: null,
              subtitle: null,
              description: null,
              publishedAtMs: 1788710000000,
            },
          ],
        },
      },
    ],
    pageInfo: {
      startCursor: 'opaque:newest',
      endCursor: 'opaque:newest',
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}
function setup(result: unknown = page()) {
  const client = new AlvaClient({ apiKey: 'test-key' });
  const request = vi.spyOn(client, '_request').mockResolvedValue({
    data: { viewer: { forYou: result } },
  });
  return { client, request };
}

describe('ForYouResource', () => {
  it('requests a single default page and preserves the full publication', async () => {
    const expected = page('x'.repeat(70000));
    const { client, request } = setup(expected);
    expect(client.forYou).toBe(client.forYou);
    expect(await client.forYou.list()).toEqual(expected);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('POST', '/query', {
      body: {
        query: expect.stringContaining('query ToolkitForYou'),
        variables: { input: { first: 20 } },
      },
    });
    const query = request.mock.calls[0][2]?.body as { query: string };
    for (const field of [
      'title body',
      'sources',
      'presentation',
      'tickers',
      'major',
      'actions',
    ]) {
      expect(query.query).toContain(field);
    }
  });

  it('passes opaque bounds together and keeps int64 IDs as strings', async () => {
    const { client, request } = setup();
    const input = {
      first: 50,
      after: 'opaque:older',
      newerThan: 'opaque:lower',
      feedId: id,
    };
    await client.forYou.list(input);
    expect(request.mock.calls[0][2]?.body).toMatchObject({
      variables: { input },
    });
  });

  it('accepts valid empty and intermediate pages', async () => {
    const empty = {
      edges: [],
      pageInfo: {
        startCursor: '',
        endCursor: '',
        hasNextPage: false,
        hasPreviousPage: true,
      },
    };
    const { client, request } = setup(empty);
    expect(await client.forYou.list()).toEqual(empty);
    const next = page();
    next.pageInfo.hasNextPage = true;
    next.pageInfo.hasPreviousPage = true;
    request.mockResolvedValue({ data: { viewer: { forYou: next } } });
    expect(await client.forYou.list({ after: 'opaque' })).toEqual(next);
  });

  it.each([
    ...[0, 51, -1, 1.5, Infinity, NaN, null, '20'].map((first) => ({ first })),
    ...['', ' ', null, 42].map((after) => ({ after })),
    ...['', ' ', null].map((newerThan) => ({ newerThan })),
    ...[
      '',
      '0',
      '-1',
      '+1',
      '1.5',
      '1e3',
      ' 1',
      '9223372036854775808',
      123,
      null,
    ].map((feedId) => ({ feedId })),
  ])('rejects invalid SDK input before I/O: %j', async (input) => {
    const { client, request } = setup();
    await expect(
      client.forYou.list(input as ForYouListParams)
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it('requires authentication without attempting the request', async () => {
    const client = new AlvaClient({});
    const request = vi.spyOn(client, '_request');
    await expect(client.forYou.list()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('fails closed on partial GraphQL errors and preserves error details', async () => {
    const { client, request } = setup();
    const errors = [
      { message: 'full login required', extensions: { code: 'FORBIDDEN' } },
    ];
    request.mockResolvedValue({ data: { viewer: { forYou: page() } }, errors });
    await expect(client.forYou.list()).rejects.toMatchObject({
      code: 'GRAPHQL_ERROR',
      message: 'full login required',
    });
  });

  it('propagates transport failures unchanged', async () => {
    const { client, request } = setup();
    const error = new Error('network unavailable');
    request.mockRejectedValue(error);
    await expect(client.forYou.list()).rejects.toBe(error);
  });

  it.each([
    null,
    {},
    { data: null },
    { data: { viewer: null } },
    { data: { viewer: { forYou: null } } },
    { errors: 'invalid' },
  ])('rejects missing or malformed GraphQL envelope: %j', async (response) => {
    const { client, request } = setup();
    request.mockResolvedValue(response);
    await expect(client.forYou.list()).rejects.toThrow();
  });

  it.each([
    { edges: null, pageInfo: {} },
    { ...page(), pageInfo: { ...page().pageInfo, endCursor: 'wrong' } },
    { ...page(), pageInfo: { ...page().pageInfo, startCursor: null } },
    { ...page(), edges: [] },
    {
      edges: [],
      pageInfo: {
        startCursor: '',
        endCursor: '',
        hasNextPage: true,
        hasPreviousPage: false,
      },
    },
    { ...page(), edges: [{ ...page().edges[0], cursor: '' }] },
    {
      ...page(),
      edges: [
        { cursor: 'opaque:newest', node: { ...page().edges[0].node, id: 123 } },
      ],
    },
    {
      ...page(),
      edges: [
        {
          cursor: 'opaque:newest',
          node: { ...page().edges[0].node, body: null },
        },
      ],
    },
  ])('rejects inconsistent connections: %j', async (invalid) => {
    const { client } = setup(invalid);
    await expect(client.forYou.list()).rejects.toMatchObject({
      code: 'GRAPHQL_INVALID_RESPONSE',
    });
  });
});

describe.each([
  ['terminal', terminal],
  ['embedded', embedded],
] as const)('%s For You command', (_name, dispatch) => {
  it('returns full JSON and maps every flag to the shared resource', async () => {
    const result = page('x'.repeat(70000));
    const { client, request } = setup(result);
    expect(
      await dispatch(client, [
        'for-you',
        'list',
        '--limit',
        '50',
        '--cursor',
        'older',
        '--newer-than',
        'lower',
        '--feed-id',
        id,
      ])
    ).toEqual(result);
    expect(request.mock.calls[0][2]?.body).toMatchObject({
      variables: {
        input: { first: 50, after: 'older', newerThan: 'lower', feedId: id },
      },
    });
  });

  it.each(
    [
      ['for-you', '--help'],
      ['for-you', 'list', '--help'],
    ].map((argv) => ({ argv }))
  )('serves help without I/O: %j', async ({ argv }) => {
    const { client, request } = setup();
    expect(await dispatch(client, argv)).toMatchObject({
      _help: true,
      text: expect.stringContaining('--newer-than'),
    });
    expect(request).not.toHaveBeenCalled();
  });

  it.each(
    [
      ['--limit', '50junk'],
      ['--limit', '1.5'],
      ['--limit', '51'],
      ['--limit', '0'],
      ['--cursor', ''],
      ['--newer-than', ' '],
      ['--feed-id', '9223372036854775808'],
      ['--user-id', '1'],
      ['--channel-id', '1'],
      ['--bogus'],
      ['unexpected'],
      ['--cursor'],
    ].map((flags) => ({ flags }))
  )('rejects invalid argv before I/O: %j', async ({ flags }) => {
    const { client, request } = setup();
    await expect(
      dispatch(client, ['for-you', 'list', ...flags])
    ).rejects.toBeInstanceOf(CliUsageError);
    expect(request).not.toHaveBeenCalled();
  });
});

it('keeps host-owned auth overrides out of the embedded profile', async () => {
  const { client, request } = setup();
  await expect(
    embedded(client, ['for-you', 'list', '--api-key', 'other'])
  ).rejects.toBeInstanceOf(CliUsageError);
  expect(request).not.toHaveBeenCalled();
});

const thesisId = '7100000000000000001';
const materialVersionId = '7100000000000000004';
const entityId = '7100000000000000010';
function publication() {
  return {
    thesisId,
    playbookId: '7100000000000000002',
    authorVersionId: '7100000000000000003',
    materialVersionId,
    itemKey: `thesis:${thesisId}:${materialVersionId}`,
    title: 'Compute capex is under-modelled',
    body: 'Full **thesis** body',
    publishedAtMs: 1788710100000,
    changeKind: 'UPDATE',
    visibility: 'PUBLIC',
    closed: false,
    archived: false,
    note: '',
    closingNote: '',
    researchPaused: false,
    entityIds: [entityId],
    categoryIds: ['7100000000000000011'],
    entityStances: [{ entityId, stance: 'BULLISH' }],
    entities: [{ id: entityId, ticker: 'NVDA', name: 'NVIDIA' }],
    publisher: {
      id: '7100000000000000020',
      displayName: 'Ada',
      avatarUrl: '',
      bio: '',
      followersCount: 12,
      viewerState: { following: null },
    },
    medias: [
      { type: 'PRICE_CHART', coverUrl: 'https://example.com/c.png', url: null },
    ],
    signalFeed: null,
    snapshotRelease: {
      versionId: '7100000000000000003',
      materialVersionId,
      publishedAtMs: 1788710100000,
      changeKind: 'UPDATE',
      sourceRefs: [
        {
          title: null,
          sourceKind: 'WEB',
          sourceContentId: '7100000000000000030',
          publicUrl: 'https://example.com',
          sourceTimeMs: null,
          locator: '',
        },
      ],
    },
  };
}
function thesisPage(overrides: Record<string, unknown> = {}) {
  const node = { itemKey: publication().itemKey, publication: publication() };
  return {
    edges: [{ cursor: 'signed:1', node }],
    pageInfo: {
      startCursor: 'signed:1',
      endCursor: 'signed:1',
      hasNextPage: false,
      hasPreviousPage: false,
    },
    listId: 'for-you:v7',
    pageCursor: 'signed:page',
    nextCursor: null,
    exhausted: true,
    scanLimited: false,
    ...overrides,
  };
}
function setupTheses(result: unknown = thesisPage()) {
  const client = new AlvaClient({ apiKey: 'test-key' });
  const request = vi.spyOn(client, '_request').mockResolvedValue({
    data: { viewer: { thesisRecommendations: result } },
  });
  return { client, request };
}

describe('ForYouResource.theses', () => {
  it('reads one ranked page without recording exposure', async () => {
    const result = thesisPage();
    const { client, request } = setupTheses(result);
    expect(await client.forYou.theses()).toEqual(result);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('POST', '/query', {
      body: {
        query: expect.stringContaining('query ToolkitForYouTheses'),
        variables: { input: { first: 10 } },
      },
    });
    const { query } = request.mock.calls[0][2]?.body as { query: string };
    for (const field of [
      'listId pageCursor nextCursor exhausted scanLimited',
      'publishedAtMs',
      'entityStances { entityId stance }',
      'snapshotRelease',
      'sourceRefs',
      'publisher',
    ]) {
      expect(query).toContain(field);
    }
    // Exposure is caller-supplied; the SDK must never let a read consume the
    // reader's own feed, and must never offer the feedback mutation.
    for (const forbidden of [
      'pendingEvents',
      'seenItemKeys',
      'recordContentFeedback',
      'isRead',
    ]) {
      expect(query).not.toContain(forbidden);
    }
    // Gateway's `items` list holds the same nodes as `edges`; selecting it
    // would put every publication body on the wire twice.
    expect(query).not.toMatch(/\bitems\b/);
  });

  it('continues an existing list session with the signed cursor', async () => {
    const { client, request } = setupTheses();
    await client.forYou.theses({ first: 3, after: 'signed:next' });
    expect(request.mock.calls[0][2]?.body).toMatchObject({
      variables: { input: { first: 3, after: 'signed:next' } },
    });
  });

  it('accepts an empty page whose cursor still advances', async () => {
    // Legitimate here, unlike `list`: endCursor advances past scanned
    // references that current visibility hides, so a mid-session page can be
    // empty while more remains.
    const empty = thesisPage({
      edges: [],
      pageInfo: {
        startCursor: '',
        endCursor: 'signed:advanced',
        hasNextPage: true,
        hasPreviousPage: false,
      },
      nextCursor: 'signed:next',
      exhausted: false,
      scanLimited: true,
    });
    const { client } = setupTheses(empty);
    expect(await client.forYou.theses()).toEqual(empty);
  });

  it.each([
    ...[0, 11, -1, 1.5, Infinity, NaN, null, '10'].map((first) => ({ first })),
    ...['', ' ', null, 42].map((after) => ({ after })),
  ])('rejects invalid SDK input before I/O: %j', async (input) => {
    const { client, request } = setupTheses();
    await expect(
      client.forYou.theses(input as ForYouThesesParams)
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it('requires authentication without attempting the request', async () => {
    const client = new AlvaClient({});
    const request = vi.spyOn(client, '_request');
    await expect(client.forYou.theses()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('fails closed on partial GraphQL errors', async () => {
    const { client, request } = setupTheses();
    request.mockResolvedValue({
      data: { viewer: { thesisRecommendations: thesisPage() } },
      errors: [{ message: 'refresh the expired list' }],
    });
    await expect(client.forYou.theses()).rejects.toMatchObject({
      code: 'GRAPHQL_ERROR',
      message: 'refresh the expired list',
    });
  });

  it('names the absent field instead of returning an empty page', async () => {
    const { client, request } = setupTheses();
    request.mockResolvedValue({
      data: { viewer: { thesisRecommendations: null } },
    });
    await expect(client.forYou.theses()).rejects.toMatchObject({
      code: 'GRAPHQL_EMPTY_RESPONSE',
      message: 'GraphQL response did not include viewer.thesisRecommendations',
    });
  });

  it.each([
    null,
    {},
    { data: null },
    { data: { viewer: null } },
    { errors: 'invalid' },
  ])('rejects missing or malformed GraphQL envelope: %j', async (response) => {
    const { client, request } = setupTheses();
    request.mockResolvedValue(response);
    await expect(client.forYou.theses()).rejects.toThrow();
  });

  it.each([
    thesisPage({ edges: null }),
    thesisPage({ listId: null }),
    thesisPage({ exhausted: 'true' }),
    thesisPage({ scanLimited: null }),
    thesisPage({ nextCursor: 42 }),
    // hasNextPage and nextCursor are one fact; disagreement means a broken read.
    thesisPage({ nextCursor: 'signed:next' }),
    thesisPage({
      pageInfo: {
        startCursor: 'wrong',
        endCursor: 'signed:1',
        hasNextPage: false,
        hasPreviousPage: false,
      },
    }),
    thesisPage({ edges: [{ cursor: '', node: thesisPage().edges[0].node }] }),
    thesisPage({
      edges: [
        {
          cursor: 'signed:1',
          node: { itemKey: '', publication: publication() },
        },
      ],
    }),
    thesisPage({
      edges: [
        {
          cursor: 'signed:1',
          node: {
            itemKey: publication().itemKey,
            publication: { ...publication(), publishedAtMs: null },
          },
        },
      ],
    }),
    thesisPage({
      edges: [
        {
          cursor: 'signed:1',
          node: {
            itemKey: publication().itemKey,
            publication: { ...publication(), entityIds: ['0'] },
          },
        },
      ],
    }),
    thesisPage({
      edges: [
        {
          cursor: 'signed:1',
          node: {
            itemKey: publication().itemKey,
            publication: { ...publication(), snapshotRelease: null },
          },
        },
      ],
    }),
    thesisPage({
      edges: [
        {
          cursor: 'signed:1',
          node: {
            itemKey: publication().itemKey,
            publication: { ...publication(), snapshotRelease: {} },
          },
        },
      ],
    }),
    thesisPage({
      edges: [
        {
          cursor: 'signed:1',
          node: {
            itemKey: publication().itemKey,
            publication: {
              ...publication(),
              snapshotRelease: {
                ...publication().snapshotRelease,
                sourceRefs: [{ sourceKind: 'WEB' }],
              },
            },
          },
        },
      ],
    }),
    thesisPage({
      edges: [
        {
          cursor: 'signed:1',
          node: {
            itemKey: publication().itemKey,
            publication: { ...publication(), categoryIds: ['0'] },
          },
        },
      ],
    }),
    thesisPage({
      edges: [
        {
          cursor: 'signed:1',
          node: {
            itemKey: publication().itemKey,
            publication: {
              ...publication(),
              entities: [{ id: '', ticker: 'NVDA', name: 'NVIDIA' }],
            },
          },
        },
      ],
    }),
    thesisPage({
      edges: [
        {
          cursor: 'signed:1',
          node: {
            itemKey: publication().itemKey,
            publication: {
              ...publication(),
              medias: [{ type: '', coverUrl: '', url: null }],
            },
          },
        },
      ],
    }),
    thesisPage({
      edges: [
        {
          cursor: 'signed:1',
          node: {
            itemKey: publication().itemKey,
            publication: {
              ...publication(),
              publisher: { ...publication().publisher, followersCount: null },
            },
          },
        },
      ],
    }),
    thesisPage({
      edges: [
        {
          cursor: 'signed:1',
          node: {
            itemKey: publication().itemKey,
            publication: {
              ...publication(),
              publisher: { ...publication().publisher, viewerState: null },
            },
          },
        },
      ],
    }),
    thesisPage({
      edges: [
        {
          cursor: 'signed:1',
          node: {
            itemKey: publication().itemKey,
            publication: { ...publication(), signalFeed: { id: '0' } },
          },
        },
      ],
    }),
    thesisPage({
      edges: [
        {
          cursor: 'signed:1',
          node: {
            itemKey: publication().itemKey,
            publication: { ...publication(), note: null },
          },
        },
      ],
    }),
    thesisPage({
      edges: [
        {
          cursor: 'signed:1',
          node: {
            itemKey: publication().itemKey,
            publication: { ...publication(), changeKind: '' },
          },
        },
      ],
    }),
  ])('rejects inconsistent recommendation pages: %#', async (invalid) => {
    const { client } = setupTheses(invalid);
    await expect(client.forYou.theses()).rejects.toMatchObject({
      code: 'GRAPHQL_INVALID_RESPONSE',
    });
  });
});

describe.each([
  ['terminal', terminal],
  ['embedded', embedded],
] as const)('%s For You theses command', (_name, dispatch) => {
  it('returns full JSON and maps every flag to the shared resource', async () => {
    const result = thesisPage();
    const { client, request } = setupTheses(result);
    expect(
      await dispatch(client, [
        'for-you',
        'theses',
        '--limit',
        '5',
        '--cursor',
        'signed:next',
      ])
    ).toEqual(result);
    expect(request.mock.calls[0][2]?.body).toMatchObject({
      variables: { input: { first: 5, after: 'signed:next' } },
    });
  });

  it('documents the ranked stop condition in help without I/O', async () => {
    const { client, request } = setupTheses();
    // The command help carries the semantics; the subcommand help is generated
    // from the flag table in embedded mode, so assert each where it lives.
    // The two profiles serve two separate strings -- terminal reads dispatch's
    // COMMAND_HELP, embedded reads AGENT_COMMAND_HELP -- so running this under
    // both is what keeps the pair from drifting.
    const help = (await dispatch(client, ['for-you', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(help._help).toBe(true);
    // `scanLimited` means the server stopped at its scan budget and more
    // remains, so it must never be offered as a second stop condition beside
    // `exhausted`: a reader that stops there silently drops recommendations.
    expect(help.text).toContain('only stop condition');
    expect(help.text).toContain('more remains, so keep paging');
    expect(
      await dispatch(client, ['for-you', 'theses', '--help'])
    ).toMatchObject({ _help: true, text: expect.stringContaining('--cursor') });
    expect(request).not.toHaveBeenCalled();
  });

  it.each(
    [
      ['--limit', '11'],
      ['--limit', '0'],
      ['--limit', '5junk'],
      ['--cursor', ''],
      // A time bound is meaningless on a ranked stream; do not silently accept it.
      ['--newer-than', 'lower'],
      ['--feed-id', '1'],
      ['--bogus'],
      ['unexpected'],
    ].map((flags) => ({ flags }))
  )('rejects invalid argv before I/O: %j', async ({ flags }) => {
    const { client, request } = setupTheses();
    await expect(
      dispatch(client, ['for-you', 'theses', ...flags])
    ).rejects.toBeInstanceOf(CliUsageError);
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects an unknown for-you subcommand', async () => {
    const { client, request } = setupTheses();
    await expect(
      dispatch(client, ['for-you', 'recommendations'])
    ).rejects.toBeInstanceOf(CliUsageError);
    expect(request).not.toHaveBeenCalled();
  });
});
