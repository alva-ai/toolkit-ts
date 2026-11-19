import { describe, expect, it } from 'vitest';
import { dispatchCli } from '../../src/cli/dispatch.js';
import { dispatch as embedded } from '../../src/cli/embeddedDispatch.js';
import { AlvaError } from '../../src/error.js';
import type { V2RequestOptions } from '../../src/platformApi.js';
import { v2Client } from '../helpers/v2Client.js';

// New commands use one path in both the terminal and the embedded tree.
const commands = {
  add: ['markets', 'watchlist', 'add'],
  remove: ['markets', 'watchlist', 'remove'],
  watchlist: ['markets', 'watchlist', 'list'],
  search: ['people', 'search'],
  followProfile: ['people', 'follows', 'follow'],
  profiles: ['people', 'follows', 'list'],
} as const;

const paths = {
  terminal: { dispatch: dispatchCli, ...commands },
  embedded: { dispatch: embedded, ...commands },
} as const;

function asset(id: string, symbol: string, kind = 'STOCK') {
  return { id, symbol, name: symbol, kind };
}

/** A by-symbol lookup answering `assets[symbol@class]`, else NOT_FOUND. */
function bySymbol(assets: Record<string, ReturnType<typeof asset>>) {
  return (symbol: string) => (o: V2RequestOptions) => {
    const found = assets[`${symbol}@${o.query?.assetClass ?? ''}`];
    if (!found) throw new AlvaError('NOT_FOUND', 'no asset', 404);
    return found;
  };
}

const PERSON = {
  id: 'profile_0p',
  kind: 'PERSON',
  displayName: 'Cathie Wood',
  handle: 'cathie-wood',
  xHandle: null,
  avatarUrl: null,
  followerCount: 1,
  viewerState: { following: false },
};

for (const [name, cli] of Object.entries(paths)) {
  describe(`follows ${name} contract`, () => {
    it('adds tickers to the watchlist through the real resource', async () => {
      const lookup = bySymbol({
        'NVDA@US_STOCK': asset('asset_0n', 'NVDA'),
        'LMT@US_STOCK': asset('asset_0l', 'LMT'),
      });
      const { client, v2 } = v2Client({
        'GET /assets/by-symbol/NVDA': lookup('NVDA'),
        'GET /assets/by-symbol/LMT': lookup('LMT'),
        'POST /me/followed-assets': {
          assets: [
            {
              asset: asset('asset_0n', 'NVDA'),
              following: true,
              changed: true,
            },
            {
              asset: asset('asset_0l', 'LMT'),
              following: true,
              changed: false,
            },
          ],
        },
      });
      const result = await cli.dispatch(client, [
        ...cli.add,
        '--tickers',
        'nvda, lmt',
        '--kind',
        'stock',
      ]);
      expect(result).toMatchObject({
        added: [{ input: 'NVDA', entityId: 'asset_0n' }],
        unchanged: [{ input: 'LMT' }],
        unresolved: [],
      });
      expect(v2).toHaveBeenLastCalledWith('POST', '/me/followed-assets', {
        body: { assetIds: ['asset_0n', 'asset_0l'] },
      });
    });

    it('removes tickers and lists the watchlist', async () => {
      const { client, v2 } = v2Client({
        'GET /assets/by-symbol/NVDA': bySymbol({
          'NVDA@': asset('asset_0n', 'NVDA'),
        })('NVDA'),
        'DELETE /me/followed-assets/asset_0n': {
          asset: asset('asset_0n', 'NVDA'),
          following: false,
          changed: true,
        },
        'GET /me/followed-assets': { items: [], nextPageToken: null },
        'GET /me/follow-counts': { assetCount: 0 },
      });
      expect(
        await cli.dispatch(client, [...cli.remove, '--tickers', 'NVDA'])
      ).toMatchObject({ removed: [{ entityId: 'asset_0n' }] });
      expect(
        await cli.dispatch(client, [...cli.watchlist, '--limit', '50'])
      ).toEqual({
        totalCount: 0,
        tickers: [],
        pageInfo: { endCursor: '', hasNextPage: false },
      });
      expect(v2).toHaveBeenCalledWith('GET', '/me/followed-assets', {
        query: { pageSize: 50, pageToken: undefined },
      });
    });

    it('searches, follows, and lists profiles', async () => {
      const page = { items: [PERSON], nextPageToken: null };
      const { client, v2 } = v2Client({
        'GET /profiles': page,
        'POST /me/followed-profiles': { following: true, profile: PERSON },
        'GET /me/followed-profiles': page,
      });
      expect(
        await cli.dispatch(client, [
          ...cli.search,
          '--query',
          'cathie',
          '--kind',
          'person',
        ])
      ).toMatchObject({ profiles: [{ kind: 'PERSON', id: 'profile_0p' }] });
      expect(
        await cli.dispatch(client, [...cli.followProfile, '--id', 'profile_0p'])
      ).toMatchObject({ following: true });
      await cli.dispatch(client, [...cli.profiles, '--kind', 'user']);
      expect(v2.mock.calls[1]).toEqual([
        'POST',
        '/me/followed-profiles',
        { body: { profileId: 'profile_0p' } },
      ]);
      expect(v2.mock.calls[2][2]).toEqual({
        query: { kind: 'USER', pageSize: 20, pageToken: undefined },
      });
    });

    it('mixes kinds in one atomic write with a per-symbol suffix', async () => {
      const lookup = bySymbol({
        'NVDA@US_STOCK': asset('asset_0n', 'NVDA'),
        'BTC@BINANCE_SPOT': asset('asset_0b', 'BTC', 'CRYPTO'),
      });
      const { client, v2 } = v2Client({
        'GET /assets/by-symbol/NVDA': lookup('NVDA'),
        'GET /assets/by-symbol/BTC': lookup('BTC'),
        'POST /me/followed-assets': {
          assets: [
            {
              asset: asset('asset_0n', 'NVDA'),
              following: true,
              changed: true,
            },
            {
              asset: asset('asset_0b', 'BTC', 'CRYPTO'),
              following: true,
              changed: true,
            },
          ],
        },
      });
      const result = await cli.dispatch(client, [
        ...cli.add,
        '--tickers',
        'NVDA,btc:Crypto',
        '--kind',
        'stock',
      ]);
      expect(result).toMatchObject({
        added: [{ input: 'NVDA' }, { input: 'BTC' }],
      });
      expect(v2.mock.calls.filter(([m]) => m === 'POST')).toEqual([
        [
          'POST',
          '/me/followed-assets',
          { body: { assetIds: ['asset_0n', 'asset_0b'] } },
        ],
      ]);
    });

    it.each([
      [[...cli.add]],
      [[...cli.add, '--tickers', ',']],
      [[...cli.add, '--tickers', 'NVDA', '--kind', 'bond']],
      [[...cli.add, '--tickers', 'BTC:bond']],
      [[...cli.add, '--tickers', 'BTC:']],
      [[...cli.add, '--tickers', ':crypto']],
      [[...cli.add, '--tickers', 'NVDA', '--user-id', '9']],
      [[...cli.watchlist, '--limit', '0']],
      [[...cli.watchlist, '--limit', '101']],
      [[...cli.search]],
      [[...cli.search, '--query', 'x', '--limit', '51']],
      [[...cli.followProfile, '--kind', 'team', '--id', 'profile_0p']],
      [[...cli.followProfile, '--kind', 'user']],
      [[...cli.followProfile, '--id', ' ']],
      [[...cli.profiles, '--kind', 'team']],
    ])('rejects invalid argv %j before any request', async (args) => {
      const { client, v2 } = v2Client({});
      await expect(cli.dispatch(client, args)).rejects.toThrow();
      expect(v2).not.toHaveBeenCalled();
    });
  });
}

describe('follows terminal paths', () => {
  it.each([
    ['subscriptions', 'watchlist-add', '--tickers', 'NVDA'],
    ['subscriptions', 'watchlist'],
    ['subscriptions', 'follow-profile', '--kind', 'user', '--id', '1'],
  ])(
    'does not expose the unreleased subscriptions path %j',
    async (...args) => {
      const { client, v2, legacy } = v2Client({});
      await expect(dispatchCli(client, args)).rejects.toThrow();
      expect(v2).not.toHaveBeenCalled();
      expect(legacy).not.toHaveBeenCalled();
    }
  );
});
