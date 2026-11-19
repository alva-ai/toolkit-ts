import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import type {
  ForYouListParams,
  ForYouThesesParams,
} from '../../src/resources/forYou.js';
import { dispatch as terminal } from '../../src/cli/index.js';
import { dispatch as embedded } from '../../src/cli/embeddedDispatch.js';
import { CliUsageError } from '../../src/error.js';
import {
  ASSET,
  MATERIAL,
  PLAYBOOK,
  PROFILE,
  THESIS,
  VERSION,
  problem,
  v2Fetch,
  wireThesis,
} from '../contentV2.js';

const FEED = 'automation_0feed';
const ENTRY = 'feed_post_0entry';

function wireEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY,
    automationId: FEED,
    majorVersion: 1,
    displayName: null,
    source: 'company-events',
    eventAt: '2026-09-06T10:33:20.000Z',
    publishedAt: '2026-09-06T10:35:00.000Z',
    title: 'Compute commitments',
    body: 'Full **card** content',
    actions: [
      {
        type: 'OPEN_URL',
        label: 'Source',
        url: 'https://example.com',
        prompt: null,
      },
    ],
    card: null,
    tickers: [{ symbol: 'NVDA' }],
    media: [],
    sources: [
      {
        type: 'WEB',
        url: 'https://example.com',
        iconUrl: null,
        title: 'Primary source',
        subtitle: null,
        description: null,
        publishedAt: '2026-09-06T10:33:20.000Z',
      },
    ],
    ...overrides,
  };
}

/** The 0.x For You entry of wireEntry(). */
function entry(body = 'Full **card** content') {
  return {
    id: ENTRY,
    feed: { id: FEED },
    major: { id: '', feedId: FEED, number: 1 },
    displayName: null,
    source: 'company-events',
    eventTimeMs: Date.parse('2026-09-06T10:33:20.000Z'),
    publishedAtMs: Date.parse('2026-09-06T10:35:00.000Z'),
    title: 'Compute commitments',
    body,
    actions: [
      {
        type: 'OPEN_URL',
        label: 'Source',
        url: 'https://example.com',
        prompt: null,
      },
    ],
    presentation: null,
    tickers: [{ symbol: 'NVDA', logoUrl: '', sentiment: null }],
    media: [],
    sources: [
      {
        type: 'WEB',
        url: 'https://example.com',
        iconUrl: null,
        title: 'Primary source',
        subtitle: null,
        description: null,
        publishedAtMs: Date.parse('2026-09-06T10:33:20.000Z'),
      },
    ],
  };
}

function client() {
  return new AlvaClient({ apiKey: 'test-key', baseUrl: 'https://api.test' });
}

afterEach(() => vi.unstubAllGlobals());

describe('ForYouResource', () => {
  it('requests a single default page and preserves the full publication', async () => {
    const body = 'x'.repeat(70000);
    const { calls } = v2Fetch({
      'GET /me/for-you-entries': {
        items: [wireEntry({ body })],
        nextPageToken: null,
      },
    });
    const c = client();
    expect(c.forYou).toBe(c.forYou);
    expect(await c.forYou.list()).toEqual({
      edges: [{ cursor: '', node: entry(body) }],
      pageInfo: {
        startCursor: '',
        endCursor: '',
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
    expect(calls).toHaveLength(1);
    expect(Object.fromEntries(calls[0].query)).toEqual({ pageSize: '20' });
  });

  it('passes the page and feed, and puts the next page token on the last edge', async () => {
    const card = {
      accentColor: '#FF0000',
      url: null,
      thumbnailUrl: null,
      footer: 'f',
      fields: [{ label: 'a', value: 'b', inline: true }],
    };
    const { calls } = v2Fetch({
      'GET /me/for-you-entries': {
        items: [
          wireEntry({ id: 'signal_01', eventAt: null, card }),
          wireEntry(),
        ],
        nextPageToken: 'older',
      },
    });
    const got = await client().forYou.list({
      first: 50,
      after: 'opaque:older',
      feedId: FEED,
    });
    expect(Object.fromEntries(calls[0].query)).toEqual({
      pageSize: '50',
      pageToken: 'opaque:older',
      automationId: FEED,
    });
    expect(got.edges.map((e) => e.cursor)).toEqual(['', 'older']);
    expect(got.edges[0].node).toMatchObject({
      id: 'signal_01',
      eventTimeMs: 0,
      presentation: { card },
    });
    expect(got.pageInfo).toEqual({
      startCursor: 'opaque:older',
      endCursor: 'older',
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('accepts an empty page', async () => {
    v2Fetch({
      'GET /me/for-you-entries': { items: [], nextPageToken: null },
    });
    expect(await client().forYou.list({ after: 'opaque' })).toEqual({
      edges: [],
      pageInfo: {
        startCursor: 'opaque',
        endCursor: '',
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });
  });

  it.each([
    ...[0, 51, -1, 1.5, Infinity, NaN, null, '20'].map((first) => ({ first })),
    ...['', ' ', null, 42].map((after) => ({ after })),
    ...['', ' ', null, 'opaque:lower'].map((newerThan) => ({ newerThan })),
    ...['', ' ', 123, null].map((feedId) => ({ feedId })),
  ])('rejects invalid SDK input before I/O: %j', async (input) => {
    const { fetcher } = v2Fetch({});
    await expect(
      client().forYou.list(input as ForYouListParams)
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires authentication without attempting the request', async () => {
    const { fetcher } = v2Fetch({});
    await expect(new AlvaClient({}).forYou.list()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps a problem and its message', async () => {
    v2Fetch({
      'GET /me/for-you-entries': problem(
        403,
        'PERMISSION_DENIED',
        'full login required'
      ),
    });
    await expect(client().forYou.list()).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      message: 'full login required',
    });
  });

  it('propagates transport failures as a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(client().forYou.list()).rejects.toMatchObject({
      message: expect.stringContaining('offline'),
    });
  });

  it.each([
    null,
    {},
    { items: null, nextPageToken: null },
    { items: [], nextPageToken: '' },
    { items: [wireEntry({ id: '' })], nextPageToken: null },
    { items: [wireEntry({ id: 123 })], nextPageToken: null },
    { items: [wireEntry({ body: null })], nextPageToken: null },
    { items: [wireEntry({ publishedAt: null })], nextPageToken: null },
    { items: [wireEntry({ tickers: null })], nextPageToken: null },
  ])('rejects inconsistent pages: %j', async (invalid) => {
    v2Fetch({ 'GET /me/for-you-entries': invalid });
    await expect(client().forYou.list()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});

describe.each([
  ['terminal', terminal],
  ['embedded', embedded],
] as const)('%s For You command', (_name, dispatch) => {
  it('returns full JSON and maps every flag to the shared resource', async () => {
    const { calls } = v2Fetch({
      'GET /me/for-you-entries': {
        items: [wireEntry()],
        nextPageToken: null,
      },
    });
    expect(
      await dispatch(client(), [
        'for-you',
        'list',
        '--limit',
        '50',
        '--cursor',
        'older',
        '--feed-id',
        FEED,
      ])
    ).toMatchObject({ edges: [{ node: entry() }] });
    expect(Object.fromEntries(calls[0].query)).toEqual({
      pageSize: '50',
      pageToken: 'older',
      automationId: FEED,
    });
  });

  it.each(
    [
      ['for-you', '--help'],
      ['for-you', 'list', '--help'],
    ].map((argv) => ({ argv }))
  )('serves help without I/O: %j', async ({ argv }) => {
    const { fetcher } = v2Fetch({});
    expect(await dispatch(client(), argv)).toMatchObject({
      _help: true,
      text: expect.stringContaining('--feed-id'),
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(
    [
      ['--limit', '50junk'],
      ['--limit', '1.5'],
      ['--limit', '51'],
      ['--limit', '0'],
      ['--cursor', ''],
      ['--newer-than', 'lower'],
      ['--feed-id', ' '],
      ['--user-id', '1'],
      ['--channel-id', '1'],
      ['--bogus'],
      ['unexpected'],
      ['--cursor'],
    ].map((flags) => ({ flags }))
  )('rejects invalid argv before I/O: %j', async ({ flags }) => {
    const { fetcher } = v2Fetch({});
    await expect(
      dispatch(client(), ['for-you', 'list', ...flags])
    ).rejects.toBeInstanceOf(CliUsageError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

it('keeps host-owned auth overrides out of the embedded profile', async () => {
  const { fetcher } = v2Fetch({});
  await expect(
    embedded(client(), ['for-you', 'list', '--api-key', 'other'])
  ).rejects.toBeInstanceOf(CliUsageError);
  expect(fetcher).not.toHaveBeenCalled();
});

const ITEM_KEY = 'thesis:42:33';
const LISTED = 'thesis_version_0listed';

/** The publication summary of wireThesis() as a recommendation. */
function publication() {
  return {
    thesisId: THESIS,
    thesisNumber: 42,
    playbookId: PLAYBOOK,
    authorVersionId: LISTED,
    materialVersionId: MATERIAL,
    itemKey: ITEM_KEY,
    title: 'Thesis',
    body: 'line one\r\nline two',
    publishedAtMs: Date.parse('2026-11-01T10:00:00.000Z'),
    changeKind: 'material',
    visibility: 'public',
    closed: false,
    archived: false,
    note: '',
    closingNote: '',
    researchPaused: false,
    entityIds: [ASSET],
    categoryIds: [],
    entityStances: [{ entityId: ASSET, stance: 'BULLISH' }],
    entities: [{ id: ASSET, ticker: 'NVDA', name: 'NVIDIA Corporation' }],
    publisher: {
      __typename: 'PublicUser',
      id: PROFILE,
      username: 'alice',
      displayName: 'Alice',
      avatarUrl: 'https://example.com/alice.png',
      bio: 'Investor',
      followersCount: 3,
      viewerState: { following: null },
    },
    medias: [],
    signalFeed: null,
    snapshotRelease: {
      versionId: VERSION,
      materialVersionId: MATERIAL,
      publishedAtMs: Date.parse('2026-11-01T10:00:00.000Z'),
      changeKind: 'material',
      sourceRefs: [],
    },
  };
}

const card = (thesis: unknown = wireThesis()) => ({
  id: LISTED,
  itemId: ITEM_KEY,
  kind: 'THESIS',
  thesis,
});

describe('ForYouResource.theses', () => {
  it('reads one Thesis-only ranked page and rebuilds the 0.x page', async () => {
    const { calls } = v2Fetch({
      'GET /me/for-you': { items: [card()], nextPageToken: null },
    });
    expect(await client().forYou.theses()).toEqual({
      edges: [
        { cursor: '', node: { itemKey: ITEM_KEY, publication: publication() } },
      ],
      pageInfo: {
        startCursor: '',
        endCursor: '',
        hasNextPage: false,
        hasPreviousPage: false,
      },
      listId: '',
      pageCursor: '',
      nextCursor: null,
      exhausted: true,
      scanLimited: false,
    });
    expect(calls).toHaveLength(1);
    // Reading records no impression: no refresh, no feedback.
    expect(Object.fromEntries(calls[0].query)).toEqual({
      ranking: 'THESIS_ONLY',
      pageSize: '10',
    });
  });

  it('continues a list with its cursor', async () => {
    const { calls } = v2Fetch({
      'GET /me/for-you': {
        items: [card(), card()],
        nextPageToken: 'signed:next',
      },
    });
    const got = await client().forYou.theses({
      first: 3,
      after: 'signed:prev',
    });
    expect(Object.fromEntries(calls[0].query)).toMatchObject({
      pageSize: '3',
      pageToken: 'signed:prev',
    });
    expect(got.edges.map((e) => e.cursor)).toEqual(['', 'signed:next']);
    expect(got).toMatchObject({
      pageInfo: {
        startCursor: 'signed:prev',
        endCursor: 'signed:next',
        hasNextPage: true,
        hasPreviousPage: true,
      },
      pageCursor: 'signed:prev',
      nextCursor: 'signed:next',
      exhausted: false,
    });
  });

  it('accepts an empty page whose cursor still advances', async () => {
    v2Fetch({
      'GET /me/for-you': { items: [], nextPageToken: 'signed:next' },
    });
    expect(await client().forYou.theses()).toMatchObject({
      edges: [],
      nextCursor: 'signed:next',
      exhausted: false,
      pageInfo: { hasNextPage: true },
    });
  });

  it('keeps an expired list as CONFLICT', async () => {
    v2Fetch({
      'GET /me/for-you': problem(
        409,
        'CONFLICT',
        'the list behind pageToken expired; start again without it'
      ),
    });
    await expect(
      client().forYou.theses({ after: 'signed:old' })
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  });

  it.each([
    ...[0, 11, -1, 1.5, Infinity, NaN, null, '10'].map((first) => ({ first })),
    ...['', ' ', null, 42].map((after) => ({ after })),
  ])('rejects invalid SDK input before I/O: %j', async (input) => {
    const { fetcher } = v2Fetch({});
    await expect(
      client().forYou.theses(input as ForYouThesesParams)
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires authentication without attempting the request', async () => {
    const { fetcher } = v2Fetch({});
    await expect(new AlvaClient({}).forYou.theses()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { items: null, nextPageToken: null },
    { items: [card()], nextPageToken: 42 },
    { items: [{ ...card(), itemId: '' }], nextPageToken: null },
    { items: [{ ...card(), id: '' }], nextPageToken: null },
    { items: [card(null)], nextPageToken: null },
    { items: [card(wireThesis({ author: null }))], nextPageToken: null },
    {
      items: [card(wireThesis({}, { publishedAt: null }))],
      nextPageToken: null,
    },
    {
      items: [
        card(wireThesis({}, { assets: [{ assetId: '', stance: 'BULLISH' }] })),
      ],
      nextPageToken: null,
    },
    {
      items: [card(wireThesis({}, { categoryIds: [''] }))],
      nextPageToken: null,
    },
    {
      items: [card(wireThesis({}, { sources: [{ kind: 'WEB' }] }))],
      nextPageToken: null,
    },
    {
      items: [
        card(
          wireThesis({}, { media: [{ type: '', coverUrl: '', url: null }] })
        ),
      ],
      nextPageToken: null,
    },
    {
      items: [
        card(
          wireThesis({
            author: { ...wireThesis().author, followerCount: null },
          })
        ),
      ],
      nextPageToken: null,
    },
    {
      items: [
        card(
          wireThesis({ author: { ...wireThesis().author, viewerState: null } })
        ),
      ],
      nextPageToken: null,
    },
    {
      items: [card(wireThesis({ signalAutomationId: '' }))],
      nextPageToken: null,
    },
    {
      items: [card(wireThesis({}, { note: 42 }))],
      nextPageToken: null,
    },
    {
      items: [card(wireThesis({}, { changeKind: '' }))],
      nextPageToken: null,
    },
    {
      items: [card(wireThesis({}, { thesisId: 'thesis_0other' }))],
      nextPageToken: null,
    },
  ])('rejects inconsistent recommendation pages: %#', async (invalid) => {
    v2Fetch({ 'GET /me/for-you': invalid });
    await expect(client().forYou.theses()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});

describe.each([
  ['terminal', terminal],
  ['embedded', embedded],
] as const)('%s For You theses command', (_name, dispatch) => {
  it('returns full JSON and maps every flag to the shared resource', async () => {
    const { calls } = v2Fetch({
      'GET /me/for-you': { items: [card()], nextPageToken: null },
    });
    expect(
      await dispatch(client(), [
        'for-you',
        'theses',
        '--limit',
        '5',
        '--cursor',
        'signed:next',
      ])
    ).toMatchObject({ edges: [{ node: { publication: publication() } }] });
    expect(Object.fromEntries(calls[0].query)).toEqual({
      ranking: 'THESIS_ONLY',
      pageSize: '5',
      pageToken: 'signed:next',
    });
  });

  it('documents the ranked stop condition in help without I/O', async () => {
    const { fetcher } = v2Fetch({});
    // The two profiles serve two separate strings -- terminal reads dispatch's
    // COMMAND_HELP, embedded reads AGENT_COMMAND_HELP -- so running this under
    // both is what keeps the pair from drifting.
    const help = (await dispatch(client(), ['for-you', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(help._help).toBe(true);
    expect(help.text).toContain('only signal that the stream has ended');
    expect(help.text).toContain('more remains, so keep paging');
    expect(help.text).toContain('budget of your own is allowed');
    expect(help.text).toContain('hold a partial stream and must say so');
    expect(help.text).not.toContain('scanLimited');
    expect(
      await dispatch(client(), ['for-you', 'theses', '--help'])
    ).toMatchObject({ _help: true, text: expect.stringContaining('--cursor') });
    expect(fetcher).not.toHaveBeenCalled();
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
    const { fetcher } = v2Fetch({});
    await expect(
      dispatch(client(), ['for-you', 'theses', ...flags])
    ).rejects.toBeInstanceOf(CliUsageError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects an unknown for-you subcommand', async () => {
    const { fetcher } = v2Fetch({});
    await expect(
      dispatch(client(), ['for-you', 'recommendations'])
    ).rejects.toBeInstanceOf(CliUsageError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
