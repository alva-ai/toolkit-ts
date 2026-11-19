import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';
import type { XReadParams } from '../../src/resources/x.js';
import { fakeV2, problem } from '../fakeV2.js';

const ACCOUNT = {
  id: 'x_account_0researcher',
  username: 'researcher',
  name: 'Researcher',
};

function page(
  items: unknown[] = [ACCOUNT],
  nextPageToken: string | null = null
) {
  return { items, nextPageToken };
}

let restore = () => {};
afterEach(() => restore());

function client() {
  return new AlvaClient({ apiKey: 'test-key', baseUrl: 'https://api.test' });
}

describe('connected X reads', () => {
  it('reads one live page each time without caching', async () => {
    const fake = fakeV2({ 'GET /me/x-following': () => page() });
    restore = fake.restore;
    const x = client().x;

    const result = await x.following();
    await x.following();

    expect(result).toEqual({
      edges: [{ cursor: '', node: ACCOUNT }],
      pageInfo: {
        startCursor: '',
        endCursor: '',
        hasNextPage: false,
        hasPreviousPage: false,
      },
      retrievedAt: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(result.retrievedAt))).toBe(false);
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[0].query.toString()).toBe('pageSize=20');
  });

  it('forwards a bounded page and its token, and rebuilds the cursors from the next token', async () => {
    const fake = fakeV2({
      'GET /me/x-following': () => page([ACCOUNT, ACCOUNT], 'token:3'),
    });
    restore = fake.restore;

    const result = await client().x.following({ first: 100, after: 'token:2' });

    expect(fake.calls[0].query.toString()).toBe(
      'pageSize=100&pageToken=token%3A2'
    );
    expect(result.edges.map((e) => e.cursor)).toEqual(['token:3', 'token:3']);
    expect(result.pageInfo).toEqual({
      startCursor: 'token:2',
      endCursor: 'token:3',
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('preserves empty intermediate pages and their continuation', async () => {
    restore = fakeV2({ 'GET /me/x-following': () => page([], 'next') }).restore;
    expect(await client().x.following()).toMatchObject({
      edges: [],
      pageInfo: { endCursor: 'next', hasNextPage: true },
    });
  });

  it('returns a disconnected status as data and reads authored Posts separately', async () => {
    const fake = fakeV2({
      'GET /me/x-connection': () => ({
        connected: false,
        canReadFollowing: false,
        canReadPosts: false,
      }),
      'GET /me/x-posts': () =>
        page([
          {
            id: 'x_post_0999',
            url: 'https://x.com/i/status/999',
            authorId: 'x_account_0123',
            text: 'view',
            createdAt: '2026-10-22T00:00:00.000Z',
          },
          {
            id: 'x_post_01000',
            url: 'https://x.com/i/status/1000',
            authorId: null,
            text: 'quiet',
            createdAt: null,
          },
        ]),
    });
    restore = fake.restore;
    const x = client().x;

    expect(await x.status()).toEqual({
      connected: false,
      canReadFollowing: false,
      canReadPosts: false,
    });
    expect((await x.posts()).edges.map((e) => e.node)).toEqual([
      {
        id: 'x_post_0999',
        text: 'view',
        authorId: 'x_account_0123',
        createdAt: '2026-10-22T00:00:00.000Z',
        url: 'https://x.com/i/status/999',
      },
      {
        id: 'x_post_01000',
        text: 'quiet',
        authorId: '',
        createdAt: '',
        url: 'https://x.com/i/status/1000',
      },
    ]);
  });

  it.each([
    { first: 0 },
    { first: 4 },
    { first: 101 },
    { first: 1.5 },
    { first: null },
    { first: NaN },
    { after: '' },
    { after: null },
    { after: 'x'.repeat(4097) },
  ])('rejects invalid parameters before I/O: %j', async (params) => {
    const c = client();
    const request = vi.spyOn(c, '_v2Request');
    await expect(c.x.following(params as XReadParams)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it('requires Alva authentication, never an X token from the agent', async () => {
    const c = new AlvaClient({});
    const request = vi.spyOn(c, '_v2Request');
    await expect(c.x.following()).rejects.toThrow();
    await expect(c.x.status()).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ['RATE_LIMITED', 429],
    ['UNAVAILABLE', 503],
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

  it.each([
    null,
    {},
    { items: {}, nextPageToken: null },
    { items: [], nextPageToken: 7 },
    page([{ id: 123, username: 'x', name: 'X' }]),
    page([{ id: 'x_account_0a', username: null, name: 'X' }]),
  ])('rejects broken success responses: %j', async (value) => {
    restore = fakeV2({ 'GET /me/x-following': () => value }).restore;
    await expect(client().x.following()).rejects.toBeInstanceOf(AlvaError);
  });
});
