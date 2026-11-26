import { describe, expect, it } from 'vitest';
import { dispatchCli } from '../../src/cli/dispatch.js';
import { dispatch as embedded } from '../../src/cli/embeddedDispatch.js';
import { AlvaError } from '../../src/error.js';
import type { V2RequestOptions } from '../../src/platformApi.js';
import { v2Client } from '../helpers/v2Client.js';
import { anAsset, aProfile } from '../socialV2.js';
import { aVersion, anAuthor, MATERIAL } from '../contentV2.js';
import { v2 } from '../v2Schema.js';

// New commands use one path in both the terminal and the embedded tree.
const commands = {
  add: ['markets', 'watchlist', 'add'],
  remove: ['markets', 'watchlist', 'remove'],
  watchlist: ['markets', 'watchlist', 'list'],
  search: ['people', 'search'],
  followProfile: ['people', 'follows', 'follow'],
  profiles: ['people', 'follows', 'list'],
  theses: ['people', 'follows', 'theses'],
} as const;

const paths = {
  terminal: { dispatch: dispatchCli, ...commands },
  embedded: { dispatch: embedded, ...commands },
} as const;

function asset(id: string, symbol: string, kind: 'STOCK' | 'CRYPTO' = 'STOCK') {
  return anAsset({ id, symbol, name: symbol, kind });
}

function followed(a: ReturnType<typeof asset>, changed = true) {
  const { id, symbol, name, kind } = a;
  return { asset: { id, symbol, name, kind }, following: true, changed };
}

/** A by-symbol lookup answering `assets[symbol@class]`, else NOT_FOUND. */
function bySymbol(assets: Record<string, ReturnType<typeof asset>>) {
  return (symbol: string) => (o: V2RequestOptions) => {
    const found = assets[`${symbol}@${o.query?.assetClass ?? ''}`];
    if (!found) throw new AlvaError('NOT_FOUND', 'no asset', 404);
    return found;
  };
}

const PERSON = aProfile({
  id: 'profile_0p',
  kind: 'PERSON',
  displayName: 'Cathie Wood',
  handle: 'cathie-wood',
  followerCount: 1,
  viewerState: { following: false },
});

for (const [name, cli] of Object.entries(paths)) {
  describe(`follows ${name} contract`, () => {
    it('adds tickers to the watchlist through the real resource', async () => {
      const lookup = bySymbol({
        'NVDA@US_STOCK': asset('asset_0n', 'NVDA'),
        'LMT@US_STOCK': asset('asset_0m', 'LMT'),
      });
      const { client, v2 } = v2Client({
        'GET /assets/by-symbol/NVDA': lookup('NVDA'),
        'GET /assets/by-symbol/LMT': lookup('LMT'),
        'POST /me/followed-assets': {
          assets: [
            followed(asset('asset_0n', 'NVDA')),
            followed(asset('asset_0m', 'LMT'), false),
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
      expect(result).toEqual({
        assets: [
          followed(asset('asset_0n', 'NVDA')),
          followed(asset('asset_0m', 'LMT'), false),
        ],
      });
      expect(v2).toHaveBeenLastCalledWith('POST', '/me/followed-assets', {
        body: { assetIds: ['asset_0n', 'asset_0m'] },
      });
    });

    it('removes tickers and lists the watchlist', async () => {
      const { client, v2 } = v2Client({
        'GET /assets/by-symbol/NVDA': bySymbol({
          'NVDA@': asset('asset_0n', 'NVDA'),
        })('NVDA'),
        'DELETE /me/followed-assets/asset_0n': {
          ...followed(asset('asset_0n', 'NVDA')),
          following: false,
        },
        'GET /me/followed-assets': { items: [], nextPageToken: null },
      });
      expect(
        await cli.dispatch(client, [...cli.remove, '--tickers', 'NVDA'])
      ).toEqual({
        assets: [{ ...followed(asset('asset_0n', 'NVDA')), following: false }],
      });
      expect(
        await cli.dispatch(client, [...cli.watchlist, '--limit', '50'])
      ).toEqual({ items: [], nextPageToken: null });
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
      ).toEqual(page);
      expect(
        await cli.dispatch(client, [...cli.followProfile, '--id', 'profile_0p'])
      ).toMatchObject({ following: true });
      await cli.dispatch(client, [...cli.profiles, '--kind', 'user']);
      expect(v2.mock.calls[1]).toEqual([
        'POST',
        '/me/followed-profiles',
        { body: { profileId: 'profile_0p' } },
      ]);
      expect(v2.mock.calls[0][2]).toEqual({
        query: { query: 'cathie', kind: 'PERSON', pageSize: undefined },
      });
      expect(v2.mock.calls[2][2]).toEqual({
        query: { kind: 'USER', pageSize: undefined, pageToken: undefined },
      });
    });

    it('reads followed Thesis Updates as a sync list, largest page first', async () => {
      const update = v2('FollowedThesisUpdate', {
        ...aVersion(),
        author: anAuthor(),
      });
      const lastPage = v2('FollowedThesisUpdateSyncList', {
        items: [
          update,
          v2('FollowedThesisUpdate', {
            ...aVersion({ id: MATERIAL }),
            author: null,
          }),
        ],
        nextPageToken: null,
        nextSyncToken: 'sync-2',
      });
      const { client, v2: transport } = v2Client({
        'GET /me/followed-profiles/thesis-updates': lastPage,
      });
      expect(await cli.dispatch(client, [...cli.theses])).toEqual(lastPage);
      await cli.dispatch(client, [...cli.theses, '--cursor', 'page-2']);
      await cli.dispatch(client, [...cli.theses, '--sync-token', 'sync-1']);
      expect(transport.mock.calls.map((c) => c[2])).toEqual([
        {
          query: { pageSize: 100, pageToken: undefined, syncToken: undefined },
        },
        { query: { pageSize: 100, pageToken: 'page-2', syncToken: undefined } },
        { query: { pageSize: 100, pageToken: undefined, syncToken: 'sync-1' } },
      ]);
    });

    it('refuses an empty token before the request', async () => {
      const { client, v2: transport } = v2Client({});
      for (const flag of ['--cursor', '--sync-token']) {
        await expect(
          cli.dispatch(client, [...cli.theses, flag, ' '])
        ).rejects.toThrow(`${flag} must be a non-empty`);
      }
      expect(transport).not.toHaveBeenCalled();
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
            followed(asset('asset_0n', 'NVDA')),
            followed(asset('asset_0b', 'BTC', 'CRYPTO')),
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
        assets: [{ asset: { id: 'asset_0n' } }, { asset: { id: 'asset_0b' } }],
      });
      expect(v2.mock.calls.filter(([m]) => m === 'POST')).toEqual([
        [
          'POST',
          '/me/followed-assets',
          { body: { assetIds: ['asset_0n', 'asset_0b'] } },
        ],
      ]);
    });

    it('writes an Asset two symbols name once, and skips listings of another kind', async () => {
      const brk = asset('asset_0b', 'BRK.B');
      const lookup = bySymbol({
        'BRK.B@': brk,
        'BRK-B@': brk,
        'COIN@US_STOCK': asset('asset_0c', 'COIN', 'CRYPTO'),
        'COIN@NON_US_STOCK': asset('asset_0d', 'COIN'),
      });
      const { client, v2 } = v2Client({
        'GET /assets/by-symbol/BRK.B': lookup('BRK.B'),
        'GET /assets/by-symbol/BRK-B': lookup('BRK-B'),
        'GET /assets/by-symbol/COIN': lookup('COIN'),
        'POST /me/followed-assets': { assets: [] },
      });
      await cli.dispatch(client, [
        ...cli.add,
        '--tickers',
        'BRK.B,BRK-B,COIN:stock',
      ]);
      expect(v2).toHaveBeenLastCalledWith('POST', '/me/followed-assets', {
        body: { assetIds: ['asset_0b', 'asset_0d'] },
      });
    });

    it('refuses tickers without an Asset before writing anything', async () => {
      const lookup = bySymbol({ 'NVDA@': asset('asset_0n', 'NVDA') });
      const { client, v2 } = v2Client({
        'GET /assets/by-symbol/NVDA': lookup('NVDA'),
        'GET /assets/by-symbol/BTC': lookup('BTC'),
        'GET /assets/by-symbol/XYZ': lookup('XYZ'),
      });
      await expect(
        cli.dispatch(client, [...cli.add, '--tickers', 'NVDA,BTC:crypto,XYZ'])
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message:
          'no CRYPTO asset found for ticker BTC; it may exist as another kind (retry with a different :kind suffix or none); no asset found for ticker XYZ',
      });
      expect(v2.mock.calls.every(([method]) => method === 'GET')).toBe(true);
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
