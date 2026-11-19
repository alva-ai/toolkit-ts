import { describe, expect, it } from 'vitest';
import { AlvaError } from '../../src/error.js';
import type { V2RequestOptions } from '../../src/platformApi.js';
import { v2Client } from '../helpers/v2Client.js';

function asset(id: string, symbol: string, kind = 'STOCK') {
  return { id, symbol, name: `${symbol} Inc.`, kind };
}

const notFound = () => {
  throw new AlvaError('NOT_FOUND', 'no asset has the symbol', 404);
};

/** Routes by-symbol lookups ("SYMBOL" or "SYMBOL@CLASS") and the follow writes. */
function tickerClient(
  assets: Record<string, ReturnType<typeof asset> | (() => never)>,
  writes: Record<string, unknown> = {}
) {
  const routes: Record<string, unknown> = { ...writes };
  for (const [key, answer] of Object.entries(assets)) {
    const symbol = key.split('@')[0];
    const path = `GET /assets/by-symbol/${encodeURIComponent(symbol)}`;
    const previous = routes[path] as
      | ((o: V2RequestOptions) => unknown)
      | undefined;
    routes[path] = (o: V2RequestOptions) => {
      const wanted = o.query?.assetClass
        ? `${symbol}@${o.query.assetClass}`
        : symbol;
      if (wanted !== key) {
        if (previous) return previous(o);
        return notFound();
      }
      return typeof answer === 'function' ? answer() : answer;
    };
  }
  return v2Client(routes);
}

function followResult(changes: [ReturnType<typeof asset>, boolean][]) {
  return {
    assets: changes.map(([a, changed]) => ({
      asset: a,
      following: true,
      changed,
    })),
  };
}

const writes = (v2: ReturnType<typeof v2Client>['v2']) =>
  v2.mock.calls.filter(([method]) => method !== 'GET');

describe('ticker watchlist', () => {
  it('normalizes input, follows the resolved Assets once and reports their outcome', async () => {
    const nvda = asset('asset_0n', 'NVDA');
    const lmt = asset('asset_0l', 'LMT');
    const { client, v2 } = tickerClient(
      { NVDA: nvda, LMT: lmt, ZZZZ: notFound },
      {
        'POST /me/followed-assets': followResult([
          [nvda, true],
          [lmt, false],
        ]),
      }
    );
    const result = await client.follows.addToWatchlist({
      tickers: [' nvda', 'NVDA', 'lmt', 'ZZZZ'],
    });
    expect(result).toEqual({
      added: [
        {
          input: 'NVDA',
          entityId: 'asset_0n',
          ticker: 'NVDA',
          name: 'NVDA Inc.',
          kind: 'STOCK',
        },
      ],
      unchanged: [
        expect.objectContaining({ input: 'LMT', entityId: 'asset_0l' }),
      ],
      unresolved: [
        {
          input: 'ZZZZ',
          code: 'NOT_FOUND',
          message: 'no entity found for ticker: ZZZZ',
        },
      ],
    });
    expect(writes(v2)).toEqual([
      [
        'POST',
        '/me/followed-assets',
        { body: { assetIds: ['asset_0n', 'asset_0l'] } },
      ],
    ]);
  });

  it('writes nothing when no ticker resolves', async () => {
    const { client, v2 } = tickerClient({ ZZZZ: notFound });
    const result = await client.follows.addToWatchlist({ tickers: ['ZZZZ'] });
    expect(result.added).toEqual([]);
    expect(result.unresolved).toHaveLength(1);
    expect(writes(v2)).toEqual([]);
  });

  it('writes one Asset once when two spellings resolve to it, in input order', async () => {
    const brk = asset('asset_0b', 'BRK-B');
    const amd = asset('asset_0a', 'AMD');
    const { client, v2 } = tickerClient(
      { 'BRK.B': brk, AMD: amd, 'BRK-B': brk },
      {
        'POST /me/followed-assets': followResult([
          [brk, true],
          [amd, true],
        ]),
      }
    );
    const result = await client.follows.addToWatchlist({
      tickers: ['BRK.B', 'AMD', 'BRK-B'],
    });
    // Both spellings report the Asset's real outcome; neither is "unchanged".
    expect(result.added.map((t) => t.input)).toEqual(['BRK.B', 'AMD', 'BRK-B']);
    expect(result.unchanged).toEqual([]);
    expect(writes(v2)[0][2]).toEqual({
      body: { assetIds: ['asset_0b', 'asset_0a'] },
    });
  });

  it('looks a kind up in its listing markets and names the kind on a miss', async () => {
    const btcCoin = asset('asset_0c', 'BTC', 'CRYPTO');
    const btcFund = asset('asset_0f', 'BTC', 'ETF');
    const { client, v2 } = tickerClient(
      { 'BTC@US_STOCK': btcFund, 'BTC@BINANCE_SPOT': btcCoin },
      { 'POST /me/followed-assets': followResult([[btcCoin, true]]) }
    );
    const result = await client.follows.addToWatchlist({
      tickers: [
        { ticker: 'BTC', kind: 'STOCK' },
        { ticker: 'btc', kind: 'CRYPTO' },
      ],
    });
    expect(result.added).toEqual([
      expect.objectContaining({
        input: 'BTC',
        entityId: 'asset_0c',
        kind: 'CRYPTO',
      }),
    ]);
    expect(result.unresolved).toEqual([
      {
        input: 'BTC',
        kind: 'STOCK',
        code: 'NOT_FOUND',
        message: expect.stringContaining(
          'no STOCK entity found for ticker BTC'
        ),
      },
    ]);
    expect(
      v2.mock.calls
        .filter(([, path]) => path.startsWith('/assets/'))
        .map(([, , o]) => o?.query?.assetClass)
        .sort()
    ).toEqual(['BINANCE_SPOT', 'NON_US_STOCK', 'US_STOCK']);
  });

  it('resolves a symbol without a kind to its primary listing', async () => {
    const { client, v2 } = tickerClient(
      { NVDA: asset('asset_0n', 'NVDA') },
      {
        'POST /me/followed-assets': followResult([
          [asset('asset_0n', 'NVDA'), true],
        ]),
      }
    );
    await client.follows.addToWatchlist({ tickers: ['NVDA'] });
    expect(v2.mock.calls[0]).toEqual([
      'GET',
      '/assets/by-symbol/NVDA',
      { query: { assetClass: undefined } },
    ]);
  });

  it('removes each resolved Asset, also those not in the watchlist', async () => {
    const { client, v2 } = tickerClient(
      { NVDA: asset('asset_0n', 'NVDA'), AMD: asset('asset_0a', 'AMD') },
      {
        'DELETE /me/followed-assets/asset_0n': {
          asset: asset('asset_0n', 'NVDA'),
          following: false,
          changed: true,
        },
        'DELETE /me/followed-assets/asset_0a': {
          asset: asset('asset_0a', 'AMD'),
          following: false,
          changed: false,
        },
      }
    );
    const result = await client.follows.removeFromWatchlist({
      tickers: ['NVDA', 'AMD'],
    });
    expect(result.removed.map((t) => t.input)).toEqual(['NVDA']);
    expect(result.unchanged.map((t) => t.input)).toEqual(['AMD']);
    // AMD is not in the watchlist, but its removal still blocks holdings sync.
    expect(
      writes(v2)
        .map(([m, p]) => `${m} ${p}`)
        .sort()
    ).toEqual([
      'DELETE /me/followed-assets/asset_0a',
      'DELETE /me/followed-assets/asset_0n',
    ]);
  });

  it('fails the whole command on a non-lookup error and never writes', async () => {
    const { client, v2 } = tickerClient({
      NVDA: asset('asset_0n', 'NVDA'),
      AMD: () => {
        throw new AlvaError('UNAVAILABLE', 'data API unavailable', 503);
      },
    });
    await expect(
      client.follows.addToWatchlist({ tickers: ['NVDA', 'AMD'] })
    ).rejects.toMatchObject({ code: 'UNAVAILABLE', status: 503 });
    expect(writes(v2)).toEqual([]);
  });

  it('propagates a refused write as a typed error', async () => {
    const { client } = tickerClient(
      { NVDA: asset('asset_0n', 'NVDA') },
      {
        'POST /me/followed-assets': () => {
          throw new AlvaError(
            'INSUFFICIENT_PERMISSION',
            'group guests cannot follow',
            403
          );
        },
      }
    );
    await expect(
      client.follows.addToWatchlist({ tickers: ['NVDA'] })
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_PERMISSION', status: 403 });
  });

  it.each([
    [{ tickers: [] }],
    [{ tickers: ['  '] }],
    [{ tickers: ['NV DA'] }],
    [{ tickers: Array.from({ length: 51 }, (_, i) => `T${i}`) }],
    [{ tickers: ['NVDA'], kind: 'BOND' }],
  ])('rejects invalid input %j before any request', async (params) => {
    const { client, v2 } = v2Client({});
    await expect(
      client.follows.addToWatchlist(params as never)
    ).rejects.toThrow();
    expect(v2).not.toHaveBeenCalled();
  });

  it('reads one page of the watchlist with its total', async () => {
    const { client, v2 } = v2Client({
      'GET /me/followed-assets': {
        items: [
          {
            ...asset('asset_0n', 'NVDA'),
            followedAt: '2026-11-01T00:00:00.000Z',
          },
          { ...asset('asset_0b', 'BTC', 'CRYPTO'), followedAt: null },
        ],
        nextPageToken: 'next',
      },
      'GET /me/follow-counts': { assetCount: 3 },
    });
    expect(await client.follows.watchlist({ first: 2, after: 'cur' })).toEqual({
      totalCount: 3,
      tickers: [
        {
          entityId: 'asset_0n',
          ticker: 'NVDA',
          name: 'NVDA Inc.',
          kind: 'STOCK',
          addedAtMs: Date.parse('2026-11-01T00:00:00.000Z'),
        },
        {
          entityId: 'asset_0b',
          ticker: 'BTC',
          name: 'BTC Inc.',
          kind: 'CRYPTO',
          addedAtMs: 0,
        },
      ],
      pageInfo: { endCursor: 'next', hasNextPage: true },
    });
    expect(v2).toHaveBeenCalledWith('GET', '/me/followed-assets', {
      query: { pageSize: 2, pageToken: 'cur' },
    });
  });

  it('ends the watchlist without a next page', async () => {
    const { client } = v2Client({
      'GET /me/followed-assets': { items: [], nextPageToken: null },
      'GET /me/follow-counts': { assetCount: 0 },
    });
    await expect(client.follows.watchlist()).resolves.toEqual({
      totalCount: 0,
      tickers: [],
      pageInfo: { endCursor: '', hasNextPage: false },
    });
  });
});

const USER = {
  id: 'profile_0u',
  kind: 'USER',
  displayName: 'Alice',
  handle: 'alice',
  xHandle: null,
  avatarUrl: null,
  followerCount: 3,
  viewerState: { following: true },
};
const PERSON = {
  id: 'profile_0p',
  kind: 'PERSON',
  displayName: 'Cathie Wood',
  handle: 'cathie-wood',
  xHandle: 'CathieDWood',
  avatarUrl: null,
  followerCount: 9,
  viewerState: { following: null },
};

describe('profile follows', () => {
  it('searches users and people and rebuilds their identities', async () => {
    const { client, v2 } = v2Client({
      'GET /profiles': { items: [USER, PERSON], nextPageToken: null },
    });
    expect(
      await client.follows.searchProfiles({ query: ' cathie ', kind: 'PERSON' })
    ).toEqual({
      profiles: [
        {
          kind: 'USER',
          id: 'profile_0u',
          displayName: 'Alice',
          followersCount: 3,
          following: true,
          username: 'alice',
        },
        {
          kind: 'PERSON',
          id: 'profile_0p',
          displayName: 'Cathie Wood',
          followersCount: 9,
          following: null,
          slug: 'cathie-wood',
          xHandle: 'CathieDWood',
        },
      ],
      pageInfo: { endCursor: '', hasNextPage: false },
    });
    expect(v2).toHaveBeenCalledWith('GET', '/profiles', {
      query: { query: 'cathie', kind: 'PERSON', pageSize: 10 },
    });
  });

  it('follows and unfollows one profile by its Profile ID', async () => {
    const { client, v2 } = v2Client({
      'POST /me/followed-profiles': { following: true, profile: PERSON },
      'DELETE /me/followed-profiles/profile_0p': {
        following: false,
        profile: null,
      },
    });
    await expect(
      client.follows.followProfile({ id: 'profile_0p' })
    ).resolves.toMatchObject({
      following: true,
      profile: { kind: 'PERSON', id: 'profile_0p' },
    });
    await expect(
      client.follows.unfollowProfile({ id: 'profile_0p', kind: 'PERSON' })
    ).resolves.toEqual({ following: false, profile: null });
    expect(v2.mock.calls[0][2]).toEqual({ body: { profileId: 'profile_0p' } });
  });

  it('lists followed profiles with a kind filter and cursor', async () => {
    const { client, v2 } = v2Client({
      'GET /me/followed-profiles': { items: [USER], nextPageToken: 'n' },
    });
    expect(
      await client.follows.profiles({ kind: 'USER', first: 5, after: 'c' })
    ).toMatchObject({ pageInfo: { endCursor: 'n', hasNextPage: true } });
    expect(v2).toHaveBeenCalledWith('GET', '/me/followed-profiles', {
      query: { kind: 'USER', pageSize: 5, pageToken: 'c' },
    });
  });

  it.each([
    [{ id: '' }],
    [{ id: '  ' }],
    [{ kind: 'TEAM', id: 'profile_0p' }],
    [{ kind: 'USER' }],
  ])(
    'rejects an invalid profile reference %j before any request',
    async (params) => {
      const { client, v2 } = v2Client({});
      await expect(
        client.follows.followProfile(params as never)
      ).rejects.toThrow();
      expect(v2).not.toHaveBeenCalled();
    }
  );
});
