import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import type { ForYouListParams } from '../../src/resources/forYou.js';
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
