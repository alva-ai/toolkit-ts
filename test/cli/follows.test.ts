import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatchCli } from '../../src/cli/dispatch.js';
import { dispatch as embedded } from '../../src/cli/embeddedDispatch.js';

const paths = {
  terminal: {
    dispatch: dispatchCli,
    add: ['subscriptions', 'watchlist-add'],
    remove: ['subscriptions', 'watchlist-remove'],
    watchlist: ['subscriptions', 'watchlist'],
    search: ['subscriptions', 'search-profiles'],
    followProfile: ['subscriptions', 'follow-profile'],
    profiles: ['subscriptions', 'profiles'],
  },
  embedded: {
    dispatch: embedded,
    add: ['markets', 'watchlist', 'add'],
    remove: ['markets', 'watchlist', 'remove'],
    watchlist: ['markets', 'watchlist', 'list'],
    search: ['people', 'search'],
    followProfile: ['people', 'follows', 'follow'],
    profiles: ['people', 'follows', 'list'],
  },
} as const;

function lookup(id: string, ticker: string, isFollowed: boolean) {
  return {
    data: {
      market: {
        entity: {
          id,
          ticker,
          name: ticker,
          kind: 'STOCK',
          viewerState: { isFollowed },
        },
      },
    },
  };
}

for (const [name, cli] of Object.entries(paths)) {
  describe(`follows ${name} contract`, () => {
    it('adds tickers to the watchlist through the real resource', async () => {
      const client = new AlvaClient({ apiKey: 'host-key' });
      const request = vi
        .spyOn(client, '_request')
        .mockResolvedValueOnce(lookup('11', 'NVDA', false))
        .mockResolvedValueOnce(lookup('12', 'LMT', true))
        .mockResolvedValueOnce({
          data: { followTickers: { entities: [{ id: '11' }] } },
        });
      const result = await cli.dispatch(client, [
        ...cli.add,
        '--tickers',
        'nvda, lmt',
        '--kind',
        'stock',
      ]);
      expect(result).toMatchObject({
        added: [{ input: 'NVDA', entityId: '11' }],
        unchanged: [{ input: 'LMT' }],
        unresolved: [],
      });
      expect(request.mock.calls[0][2]?.body).toMatchObject({
        variables: { input: { ticker: 'NVDA', kind: 'STOCK' } },
      });
      expect(request.mock.calls[2][2]?.body).toMatchObject({
        variables: { input: { entityIds: ['11'] } },
      });
    });

    it('removes tickers and lists the watchlist', async () => {
      const client = new AlvaClient({ apiKey: 'host-key' });
      const request = vi
        .spyOn(client, '_request')
        .mockResolvedValueOnce(lookup('11', 'NVDA', true))
        .mockResolvedValueOnce({
          data: { unfollowTickers: { entities: [{ id: '11' }] } },
        })
        .mockResolvedValueOnce({
          data: {
            viewer: {
              marketWatchlist: {
                totalCount: 0,
                edges: [],
                pageInfo: { endCursor: null, hasNextPage: false },
              },
            },
          },
        });
      expect(
        await cli.dispatch(client, [...cli.remove, '--tickers', 'NVDA'])
      ).toMatchObject({ removed: [{ entityId: '11' }] });
      expect(
        await cli.dispatch(client, [...cli.watchlist, '--limit', '50'])
      ).toEqual({
        totalCount: 0,
        tickers: [],
        pageInfo: { endCursor: '', hasNextPage: false },
      });
      expect(request.mock.calls[2][2]?.body).toMatchObject({
        variables: { input: { first: 50 } },
      });
    });

    it('searches, follows, and lists profiles', async () => {
      const node = {
        __typename: 'Person',
        id: '42',
        displayName: 'Cathie Wood',
        slug: 'cathie-wood',
        xHandle: null,
        followersCount: 1,
        viewerState: { following: false },
      };
      const connection = {
        edges: [{ node }],
        pageInfo: { endCursor: 'c', hasNextPage: false },
      };
      const client = new AlvaClient({ apiKey: 'host-key' });
      const request = vi
        .spyOn(client, '_request')
        .mockResolvedValueOnce({ data: { profiles: connection } })
        .mockResolvedValueOnce({
          data: { followProfile: { following: true, target: node } },
        })
        .mockResolvedValueOnce({
          data: { viewer: { followingProfiles: connection } },
        });
      expect(
        await cli.dispatch(client, [
          ...cli.search,
          '--query',
          'cathie',
          '--kind',
          'person',
        ])
      ).toMatchObject({ profiles: [{ kind: 'PERSON', id: '42' }] });
      expect(
        await cli.dispatch(client, [
          ...cli.followProfile,
          '--kind',
          'person',
          '--id',
          '42',
        ])
      ).toMatchObject({ following: true });
      await cli.dispatch(client, [...cli.profiles, '--kind', 'user']);
      expect(request.mock.calls[1][2]?.body).toMatchObject({
        variables: { input: { kind: 'PERSON', id: '42' } },
      });
      expect(request.mock.calls[2][2]?.body).toMatchObject({
        variables: { input: { kind: 'USER', first: 20 } },
      });
    });

    it.each([
      [[...cli.add]],
      [[...cli.add, '--tickers', ',']],
      [[...cli.add, '--tickers', 'NVDA', '--kind', 'bond']],
      [[...cli.add, '--tickers', 'NVDA', '--user-id', '9']],
      [[...cli.watchlist, '--limit', '0']],
      [[...cli.watchlist, '--limit', '101']],
      [[...cli.search]],
      [[...cli.search, '--query', 'x', '--limit', '51']],
      [[...cli.followProfile, '--kind', 'team', '--id', '1']],
      [[...cli.followProfile, '--kind', 'user', '--id', 'alice']],
      [[...cli.followProfile, '--kind', 'user']],
      [[...cli.profiles, '--kind', 'team']],
    ])('rejects invalid argv %j before any request', async (args) => {
      const client = new AlvaClient({ apiKey: 'host-key' });
      const request = vi.spyOn(client, '_request');
      await expect(cli.dispatch(client, args)).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
    });
  });
}
