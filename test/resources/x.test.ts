import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { fakeV2, problem } from '../fakeV2.js';
import { page, xAccount, xConnection, xPost } from '../marketV2.js';

let restore = () => {};
afterEach(() => restore());

function client() {
  return new AlvaClient({ apiKey: 'test-key', baseUrl: 'https://api.test' });
}

describe('connected X reads', () => {
  it('reads one live page each time, as the API answers it', async () => {
    const fake = fakeV2({
      'GET /me/x-following': () => page([xAccount()], 'next'),
    });
    restore = fake.restore;
    const x = client().x;

    await expect(x.following()).resolves.toEqual(page([xAccount()], 'next'));
    await x.following({ pageSize: 5, pageToken: 'next' });

    expect(fake.calls.map((c) => c.query.toString())).toEqual([
      '',
      'pageSize=5&pageToken=next',
    ]);
  });

  it('returns the connection and the authored posts unchanged', async () => {
    const posts = page([xPost({ authorId: null, createdAt: null })]);
    restore = fakeV2({
      'GET /me/x-connection': () => xConnection({ connected: false }),
      'GET /me/x-posts': () => posts,
    }).restore;

    await expect(client().x.status()).resolves.toEqual(
      xConnection({ connected: false })
    );
    await expect(client().x.posts()).resolves.toEqual(posts);
  });

  it('requires Alva authentication, never an X token from the agent', async () => {
    const c = new AlvaClient({});
    const request = vi.spyOn(c, '_v2Request');
    await expect(c.x.following()).rejects.toThrow();
    await expect(c.x.status()).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ['INVALID_ARGUMENT', 400],
    ['INSUFFICIENT_PERMISSION', 403],
    ['UNAUTHENTICATED', 401],
  ])('preserves %s problems with status %i', async (code, status) => {
    restore = fakeV2({
      'GET /me/x-following': () =>
        problem(status, code, { detail: 'read failed' }),
    }).restore;
    await expect(client().x.following()).rejects.toMatchObject({
      code,
      status,
      message: 'read failed',
    });
  });
});
