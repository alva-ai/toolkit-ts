import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatchCli } from '../../src/cli/dispatch.js';
import { dispatch as embedded } from '../../src/cli/embeddedDispatch.js';
import { fakeV2, problem } from '../fakeV2.js';

let restore = () => {};
afterEach(() => restore());

for (const [name, dispatch] of [
  ['terminal', dispatchCli],
  ['embedded', embedded],
] as const) {
  describe(`connected X ${name} contract`, () => {
    it('uses the real authenticated resource for defaults, continuation, and status', async () => {
      const client = new AlvaClient({ apiKey: 'host-key' });
      const fake = fakeV2({
        'GET /me/x-following': () => ({ items: [], nextPageToken: 'next' }),
        'GET /me/x-connection': () => ({
          connected: true,
          canReadFollowing: true,
          canReadPosts: true,
        }),
        'GET /me/x-posts': () => ({ items: [], nextPageToken: null }),
      });
      restore = fake.restore;
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
      expect(fake.calls[1].query.toString()).toBe('pageSize=25&pageToken=next');
      expect(fake.calls[1].headers['X-Alva-Api-Key']).toBe('host-key');
      expect(await dispatch(client, ['x', 'status'])).toMatchObject({
        connected: true,
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
      const request = vi.spyOn(client, '_v2Request');
      await expect(dispatch(client, args)).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
    });
    it('propagates upstream denial without retrying or returning empty success', async () => {
      const client = new AlvaClient({ apiKey: 'host-key' });
      const fake = fakeV2({
        'GET /me/x-following': () =>
          problem(429, 'RATE_LIMITED', { detail: 'X API rate limit reached' }),
      });
      restore = fake.restore;
      await expect(dispatch(client, ['x', 'following'])).rejects.toThrow(
        'rate limit'
      );
      expect(fake.calls).toHaveLength(1);
    });
  });
}
