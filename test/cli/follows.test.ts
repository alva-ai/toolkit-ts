import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatchCli } from '../../src/cli/dispatch.js';
import { dispatch as embedded } from '../../src/cli/embeddedDispatch.js';

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

// A REST thesis as GET /api/v1/me/following/theses returns it.
function restThesis(versionID: string, changeKind: string) {
  return {
    id: '7',
    author_version_id: versionID,
    material_version_id: versionID,
    body: 'Power caps neocloud growth into 2027.',
    entity_ids: ['3'],
    visibility: 'public',
    closed: false,
    archived: false,
    closing_note: '',
    author_kind: 'public_source',
    author_ref: 'cathie-wood',
    change_kind: changeKind,
  };
}

const paths = {
  terminal: { dispatch: dispatchCli, ...commands },
  embedded: { dispatch: embedded, ...commands },
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

    it('reads followed theses with the largest page and the given cursor', async () => {
      const client = new AlvaClient({ apiKey: 'host-key' });
      const author = {
        kind: 'user',
        username: 'carol',
        display_name: 'Carol',
      };
      const request = vi.spyOn(client, '_request').mockResolvedValueOnce({
        items: [
          { thesis: restThesis('11', 'initial'), author },
          { thesis: restThesis('12', 'material'), author: null },
        ],
        next_cursor: 'c2',
        has_more: true,
      });
      const page = await cli.dispatch(client, [
        ...cli.theses,
        '--cursor',
        'c1',
      ]);
      expect(request).toHaveBeenCalledWith(
        'GET',
        '/api/v1/me/following/theses',
        { query: { first: '100', cursor: 'c1' } }
      );
      expect(page).toMatchObject({
        items: [
          {
            thesis: { author_version_id: '11', change_kind: 'initial' },
            author,
          },
          { thesis: { change_kind: 'material' }, author: null },
        ],
        next_cursor: 'c2',
        has_more: true,
      });
    });

    it('refuses a following page it cannot resume or read', async () => {
      const client = new AlvaClient({ apiKey: 'host-key' });
      vi.spyOn(client, '_request')
        .mockResolvedValueOnce({ items: [], has_more: false })
        .mockResolvedValueOnce({
          items: [{ thesis: { id: '7' }, author: null }],
          next_cursor: 'c2',
          has_more: false,
        })
        .mockResolvedValueOnce({
          items: [
            {
              thesis: restThesis('11', 'initial'),
              author: { kind: 'person', slug: 'x', display_name: 'x' },
            },
          ],
          next_cursor: 'c2',
          has_more: false,
        })
        .mockResolvedValueOnce({
          items: [
            {
              thesis: restThesis('11', 'initial'),
              author: { kind: 'user', display_name: 'x' },
            },
          ],
          next_cursor: 'c2',
          has_more: false,
        });
      for (let i = 0; i < 4; i++) {
        await expect(
          cli.dispatch(client, [...cli.theses])
        ).rejects.toMatchObject({
          code: 'INVALID_RESPONSE',
        });
      }
    });

    it('mixes kinds in one atomic write with a per-symbol suffix', async () => {
      const client = new AlvaClient({ apiKey: 'host-key' });
      const request = vi
        .spyOn(client, '_request')
        .mockResolvedValueOnce(lookup('11', 'NVDA', false))
        .mockResolvedValueOnce(lookup('21', 'BTC', false))
        .mockResolvedValueOnce({
          data: { followTickers: { entities: [{ id: '11' }, { id: '21' }] } },
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
      expect(request.mock.calls[0][2]?.body).toMatchObject({
        variables: { input: { ticker: 'NVDA', kind: 'STOCK' } },
      });
      expect(request.mock.calls[1][2]?.body).toMatchObject({
        variables: { input: { ticker: 'BTC', kind: 'CRYPTO' } },
      });
      expect(request).toHaveBeenCalledTimes(3);
      expect(request.mock.calls[2][2]?.body).toMatchObject({
        variables: { input: { entityIds: ['11', '21'] } },
      });
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

describe('follows terminal paths', () => {
  it.each([
    ['subscriptions', 'watchlist-add', '--tickers', 'NVDA'],
    ['subscriptions', 'watchlist'],
    ['subscriptions', 'follow-profile', '--kind', 'user', '--id', '1'],
  ])(
    'does not expose the unreleased subscriptions path %j',
    async (...args) => {
      const client = new AlvaClient({ apiKey: 'host-key' });
      const request = vi.spyOn(client, '_request');
      await expect(dispatchCli(client, args)).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
    }
  );
});
