import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';

interface GraphQLBody {
  query: string;
  variables?: Record<string, unknown>;
}

type Entity = { id: string; ticker: string; isFollowed: boolean };

function graphqlError(code: string, message: string) {
  return { data: null, errors: [{ message, extensions: { code } }] };
}

function entityResponse(entity: Entity) {
  return {
    data: {
      market: {
        entity: {
          id: entity.id,
          ticker: entity.ticker,
          name: `${entity.ticker} Inc.`,
          kind: 'STOCK',
          viewerState: { isFollowed: entity.isFollowed },
        },
      },
    },
  };
}

/** Routes ticker lookups by symbol and records mutation bodies. */
function tickerClient(lookups: Record<string, unknown>, mutation?: unknown) {
  const client = new AlvaClient({ apiKey: 'test-key' });
  const mutations: GraphQLBody[] = [];
  const request = vi
    .spyOn(client, '_request')
    .mockImplementation(async (_method, _path, options) => {
      const body = options?.body as GraphQLBody;
      if (body.query.includes('ToolkitTickerLookup')) {
        const input = body.variables?.input as { ticker: string };
        const response = lookups[input.ticker];
        if (response === undefined)
          throw new Error(`unexpected ${input.ticker}`);
        return response;
      }
      mutations.push(body);
      return (
        mutation ?? {
          data: {
            followTickers: { entities: [] },
            unfollowTickers: { entities: [] },
          },
        }
      );
    });
  return { client, request, mutations };
}

describe('ticker watchlist', () => {
  it('normalizes input, groups outcomes, and writes only the changed tickers once', async () => {
    const { client, mutations } = tickerClient({
      NVDA: entityResponse({ id: '11', ticker: 'NVDA', isFollowed: false }),
      LMT: entityResponse({ id: '12', ticker: 'LMT', isFollowed: true }),
      ZZZZ: graphqlError('NOT_FOUND', 'no entity found for ticker: ZZZZ'),
      CRCL: graphqlError(
        'FAILED_PRECONDITION',
        'multiple entities found for ticker CRCL; specify an entity id or kind'
      ),
    });
    const result = await client.follows.addToWatchlist({
      tickers: [' nvda', 'NVDA', 'lmt', 'ZZZZ', 'crcl'],
    });
    expect(result.added.map((t) => [t.input, t.entityId])).toEqual([
      ['NVDA', '11'],
    ]);
    expect(result.unchanged.map((t) => t.input)).toEqual(['LMT']);
    expect(result.unresolved).toEqual([
      expect.objectContaining({ input: 'ZZZZ', code: 'NOT_FOUND' }),
      expect.objectContaining({ input: 'CRCL', code: 'FAILED_PRECONDITION' }),
    ]);
    expect(mutations).toHaveLength(1);
    expect(mutations[0].query).toContain('followTickers(input: $input)');
    expect(mutations[0].variables).toEqual({ input: { entityIds: ['11'] } });
  });

  it('writes nothing when no ticker resolves or every ticker is unchanged', async () => {
    const { client, mutations } = tickerClient({
      ZZZZ: graphqlError('NOT_FOUND', 'missing'),
      LMT: entityResponse({ id: '12', ticker: 'LMT', isFollowed: true }),
    });
    const missing = await client.follows.addToWatchlist({ tickers: ['ZZZZ'] });
    expect(missing.added).toEqual([]);
    expect(missing.unresolved).toHaveLength(1);
    const unchanged = await client.follows.addToWatchlist({ tickers: ['LMT'] });
    expect(unchanged.unchanged).toHaveLength(1);
    expect(mutations).toHaveLength(0);
  });

  it('writes one entity once when two spellings resolve to it', async () => {
    const { client, mutations } = tickerClient({
      'BRK.B': entityResponse({ id: '30', ticker: 'BRK.B', isFollowed: false }),
      'BRK-B': entityResponse({ id: '30', ticker: 'BRK.B', isFollowed: false }),
    });
    const result = await client.follows.addToWatchlist({
      tickers: ['BRK.B', 'BRK-B'],
    });
    // Both inputs report the entity's real outcome; neither is "unchanged".
    expect(result.added.map((t) => t.input)).toEqual(['BRK.B', 'BRK-B']);
    expect(result.unchanged).toEqual([]);
    expect(mutations[0].variables).toEqual({ input: { entityIds: ['30'] } });
  });

  it('names the kind when a kind-restricted lookup misses', async () => {
    const { client, mutations } = tickerClient({
      BTC: { data: { market: { entity: null } } },
    });
    const result = await client.follows.addToWatchlist({
      tickers: [{ ticker: 'BTC', kind: 'STOCK' }],
    });
    expect(result.unresolved).toEqual([
      expect.objectContaining({
        input: 'BTC',
        kind: 'STOCK',
        code: 'NOT_FOUND',
        message: expect.stringContaining(
          'no STOCK entity found for ticker BTC'
        ),
      }),
    ]);
    expect(mutations).toEqual([]);
  });

  it('lets a per-ticker kind override the default and dedupes by ticker and kind', async () => {
    const { client, request } = tickerClient({
      NVDA: entityResponse({ id: '11', ticker: 'NVDA', isFollowed: false }),
      BTC: entityResponse({ id: '21', ticker: 'BTC', isFollowed: false }),
    });
    await client.follows.addToWatchlist({
      tickers: ['nvda', { ticker: 'btc', kind: 'CRYPTO' }, 'NVDA'],
      kind: 'STOCK',
    });
    const lookups = request.mock.calls
      .map((call) => call[2]?.body as { variables: { input: unknown } })
      .filter((body) => JSON.stringify(body).includes('ToolkitTickerLookup'))
      .map((body) => body.variables.input);
    expect(lookups).toEqual([
      { ticker: 'NVDA', kind: 'STOCK' },
      { ticker: 'BTC', kind: 'CRYPTO' },
    ]);
  });

  it('records removal for every resolved ticker and forwards the kind filter', async () => {
    const { client, request, mutations } = tickerClient({
      NVDA: entityResponse({ id: '11', ticker: 'NVDA', isFollowed: true }),
      AMD: entityResponse({ id: '13', ticker: 'AMD', isFollowed: false }),
    });
    const result = await client.follows.removeFromWatchlist({
      tickers: ['NVDA', 'AMD'],
      kind: 'STOCK',
    });
    expect(result.removed.map((t) => t.input)).toEqual(['NVDA']);
    expect(result.unchanged.map((t) => t.input)).toEqual(['AMD']);
    expect(mutations[0].query).toContain('unfollowTickers(input: $input)');
    // AMD is not in the watchlist, but its removal still blocks holdings sync.
    expect(mutations[0].variables).toEqual({
      input: { entityIds: ['11', '13'] },
    });
    expect(request.mock.calls[0][2]?.body).toMatchObject({
      variables: { input: { kind: 'STOCK' } },
    });
  });

  it('fails the whole command on a non-lookup error and never writes', async () => {
    const { client, mutations } = tickerClient({
      NVDA: entityResponse({ id: '11', ticker: 'NVDA', isFollowed: false }),
      AMD: graphqlError('UNAVAILABLE', 'data API unavailable'),
    });
    const error = await client.follows
      .addToWatchlist({ tickers: ['NVDA', 'AMD'] })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AlvaError);
    expect(error).toMatchObject({ code: 'UNAVAILABLE', status: 503 });
    expect(mutations).toHaveLength(0);
  });

  it.each(['add', 'remove'] as const)(
    'fails before writing when the %s lookup cannot read watchlist state',
    async (direction) => {
      const hidden = entityResponse({
        id: '11',
        ticker: 'NVDA',
        isFollowed: false,
      });
      hidden.data.market.entity.viewerState = null as never;
      const { client, mutations } = tickerClient({ NVDA: hidden });
      const call =
        direction === 'add'
          ? client.follows.addToWatchlist({ tickers: ['NVDA'] })
          : client.follows.removeFromWatchlist({ tickers: ['NVDA'] });
      await expect(call).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        status: 403,
      });
      expect(mutations).toHaveLength(0);
    }
  );

  it('propagates a rejected write as a typed error', async () => {
    const { client } = tickerClient(
      { NVDA: entityResponse({ id: '11', ticker: 'NVDA', isFollowed: false }) },
      graphqlError('PERMISSION_DENIED', 'group guests cannot follow')
    );
    await expect(
      client.follows.addToWatchlist({ tickers: ['NVDA'] })
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED', status: 403 });
  });

  it.each([
    [{ tickers: [] }],
    [{ tickers: ['  '] }],
    [{ tickers: ['NV DA'] }],
    [{ tickers: Array.from({ length: 51 }, (_, i) => `T${i}`) }],
    [{ tickers: ['NVDA'], kind: 'BOND' }],
  ])('rejects invalid input %j before any request', async (params) => {
    const { client, request } = tickerClient({});
    await expect(
      client.follows.addToWatchlist(params as never)
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it('reads one page of the watchlist', async () => {
    const client = new AlvaClient({ apiKey: 'test-key' });
    const request = vi.spyOn(client, '_request').mockResolvedValue({
      data: {
        viewer: {
          marketWatchlist: {
            totalCount: 3,
            edges: [
              {
                cursor: '9',
                followedAtMs: 1762250000000,
                node: {
                  id: '11',
                  ticker: 'NVDA',
                  name: 'NVIDIA',
                  kind: 'STOCK',
                },
              },
            ],
            pageInfo: { endCursor: '9', hasNextPage: true },
          },
        },
      },
    });
    const page = await client.follows.watchlist({ first: 1, after: '20' });
    expect(page).toEqual({
      totalCount: 3,
      tickers: [
        {
          entityId: '11',
          ticker: 'NVDA',
          name: 'NVIDIA',
          kind: 'STOCK',
          addedAtMs: 1762250000000,
        },
      ],
      pageInfo: { endCursor: '9', hasNextPage: true },
    });
    expect(request.mock.calls[0][2]?.body).toMatchObject({
      variables: { input: { first: 1, after: '20' } },
    });
  });
});

const userNode = {
  __typename: 'PublicUser',
  id: '7',
  displayName: 'Alice',
  username: 'alice',
  followersCount: 3,
  viewerState: { following: false },
};
const personNode = {
  __typename: 'Person',
  id: '42',
  displayName: 'Cathie Wood',
  slug: 'cathie-wood',
  xHandle: 'cathiedwood',
  followersCount: 900,
  viewerState: { following: true },
};

describe('profile follows', () => {
  it('searches users and people and normalizes their identities', async () => {
    const client = new AlvaClient({ apiKey: 'test-key' });
    const request = vi.spyOn(client, '_request').mockResolvedValue({
      data: {
        profiles: {
          edges: [{ node: userNode }, { node: personNode }],
          pageInfo: { endCursor: 'c2', hasNextPage: false },
        },
      },
    });
    const page = await client.follows.searchProfiles({
      query: '  cathie ',
      kind: 'PERSON',
    });
    expect(page.profiles).toEqual([
      {
        kind: 'USER',
        id: '7',
        displayName: 'Alice',
        username: 'alice',
        followersCount: 3,
        following: false,
      },
      {
        kind: 'PERSON',
        id: '42',
        displayName: 'Cathie Wood',
        slug: 'cathie-wood',
        xHandle: 'cathiedwood',
        followersCount: 900,
        following: true,
      },
    ]);
    expect(request.mock.calls[0][2]?.body).toMatchObject({
      variables: { input: { query: 'cathie', kind: 'PERSON', first: 10 } },
    });
  });

  it('follows and unfollows one profile by kind and id', async () => {
    const client = new AlvaClient({ apiKey: 'test-key' });
    const request = vi
      .spyOn(client, '_request')
      .mockResolvedValueOnce({
        data: { followProfile: { following: true, target: personNode } },
      })
      .mockResolvedValueOnce({
        data: { unfollowProfile: { following: false, target: null } },
      });
    expect(
      await client.follows.followProfile({ kind: 'PERSON', id: '42' })
    ).toMatchObject({ following: true, profile: { kind: 'PERSON', id: '42' } });
    expect(
      await client.follows.unfollowProfile({ kind: 'PERSON', id: '42' })
    ).toEqual({ following: false, profile: null });
    expect(request.mock.calls[0][2]?.body).toMatchObject({
      query: expect.stringContaining('followProfile(input: $input)'),
      variables: { input: { kind: 'PERSON', id: '42' } },
    });
    expect(request.mock.calls[1][2]?.body).toMatchObject({
      query: expect.stringContaining('unfollowProfile(input: $input)'),
    });
  });

  it('lists followed profiles with a kind filter and cursor', async () => {
    const client = new AlvaClient({ apiKey: 'test-key' });
    const request = vi.spyOn(client, '_request').mockResolvedValue({
      data: {
        viewer: {
          followingProfiles: {
            edges: [{ node: userNode }],
            pageInfo: { endCursor: 'n', hasNextPage: true },
          },
        },
      },
    });
    const page = await client.follows.profiles({
      kind: 'USER',
      first: 5,
      after: 'm',
    });
    expect(page.pageInfo).toEqual({ endCursor: 'n', hasNextPage: true });
    expect(request.mock.calls[0][2]?.body).toMatchObject({
      variables: { input: { kind: 'USER', first: 5, after: 'm' } },
    });
  });

  it.each([
    [{ kind: 'TEAM', id: '1' }],
    [{ kind: 'USER', id: '0' }],
    [{ kind: 'USER', id: 'alice' }],
  ])('rejects an invalid profile reference %j', async (params) => {
    const client = new AlvaClient({ apiKey: 'test-key' });
    const request = vi.spyOn(client, '_request');
    await expect(
      client.follows.followProfile(params as never)
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it('reads an omitted person X handle as null', async () => {
    const client = new AlvaClient({ apiKey: 'test-key' });
    const withoutHandle: Record<string, unknown> = { ...personNode };
    delete withoutHandle.xHandle;
    vi.spyOn(client, '_request').mockResolvedValue({
      data: {
        profiles: {
          edges: [{ node: withoutHandle }],
          pageInfo: { endCursor: '', hasNextPage: false },
        },
      },
    });
    const page = await client.follows.searchProfiles({ query: 'cathie' });
    expect(page.profiles[0]).toMatchObject({ kind: 'PERSON', xHandle: null });
  });

  it('fails closed on an unrecognized profile type', async () => {
    const client = new AlvaClient({ apiKey: 'test-key' });
    vi.spyOn(client, '_request').mockResolvedValue({
      data: {
        profiles: {
          edges: [{ node: { ...userNode, __typename: 'Team' } }],
          pageInfo: { endCursor: '', hasNextPage: false },
        },
      },
    });
    await expect(
      client.follows.searchProfiles({ query: 'x' })
    ).rejects.toMatchObject({ code: 'GRAPHQL_INVALID_RESPONSE' });
  });
});
