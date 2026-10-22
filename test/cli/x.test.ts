import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatchCli } from '../../src/cli/dispatch.js';
import { dispatch as embedded } from '../../src/cli/embeddedDispatch.js';

for (const [name, dispatch] of [
  ['terminal', dispatchCli],
  ['embedded', embedded],
] as const) {
  describe(`connected X ${name} contract`, () => {
    it('uses the real authenticated resource for defaults, continuation, and status', async () => {
      const client = new AlvaClient({ apiKey: 'host-key' });
      const request = vi.spyOn(client, '_request').mockResolvedValue({
        data: {
          viewer: {
            xFollowing: {
              edges: [],
              pageInfo: {
                startCursor: '',
                endCursor: 'next',
                hasNextPage: true,
                hasPreviousPage: false,
              },
            },
          },
        },
      });
      expect(await dispatch(client, ['x', 'following'])).toMatchObject({
        edges: [],
        pageInfo: { endCursor: 'next', hasNextPage: true },
      });
      await dispatch(client, [
        'x',
        'following',
        '--limit',
        '25',
        '--cursor',
        'next',
      ]);
      expect(request.mock.calls[1][2]?.body).toMatchObject({
        variables: { first: 25, after: 'next' },
      });
      request.mockResolvedValueOnce({
        data: {
          viewer: {
            xConnection: {
              connected: true,
              canReadFollowing: true,
              canReadPosts: true,
            },
          },
        },
      });
      expect(await dispatch(client, ['x', 'status'])).toMatchObject({
        connected: true,
      });
      request.mockResolvedValueOnce({
        data: {
          viewer: {
            xPosts: {
              edges: [],
              pageInfo: {
                startCursor: '',
                endCursor: '',
                hasNextPage: false,
                hasPreviousPage: false,
              },
            },
          },
        },
      });
      expect(await dispatch(client, ['x', 'posts'])).toMatchObject({
        edges: [],
      });
    });
    it.each(
      [
        ['x', 'following', '--limit', '0'],
        ['x', 'posts', '--limit', '101'],
        ['x', 'following', '--limit', '1.5'],
        ['x', 'following', '--user-id', '99'],
        ['x', 'following', '--cursor', ''],
        ['x', 'bookmarks'],
      ].map((args) => ({ args }))
    )('rejects invalid/unsupported argv $args', async ({ args }) => {
      const client = new AlvaClient({ apiKey: 'host-key' });
      const request = vi.spyOn(client, '_request');
      await expect(dispatch(client, args)).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
    });
    it('propagates upstream denial without retrying or returning empty success', async () => {
      const client = new AlvaClient({ apiKey: 'host-key' });
      const request = vi.spyOn(client, '_request').mockResolvedValue({
        errors: [
          {
            message: 'X API rate limit reached',
            extensions: { code: 'RESOURCE_EXHAUSTED' },
          },
        ],
      });
      await expect(dispatch(client, ['x', 'following'])).rejects.toThrow(
        'rate limit'
      );
      expect(request).toHaveBeenCalledTimes(1);
    });
  });
}
