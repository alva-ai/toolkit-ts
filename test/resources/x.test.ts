import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';
import type { XReadParams } from '../../src/resources/x.js';

function page(
  edges: unknown[] = [
    {
      cursor: 'opaque',
      node: {
        id: '9007199254740993',
        username: 'researcher',
        name: 'Researcher',
      },
    },
  ]
) {
  return {
    edges,
    pageInfo: {
      startCursor: edges.length ? 'opaque' : '',
      endCursor: edges.length ? 'opaque' : '',
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}
function setup(value: unknown = page()) {
  const client = new AlvaClient({ apiKey: 'test-key' });
  const request = vi
    .spyOn(client, '_request')
    .mockResolvedValue({ data: { viewer: { xFollowing: value } } });
  return { client, request };
}

describe('connected X reads', () => {
  it('reads one live page each time without caching, preserving X snowflakes', async () => {
    const { client, request } = setup();
    const result = await client.x.following();
    expect(result.edges[0]?.node.id).toBe('9007199254740993');
    expect(Number.isNaN(Date.parse(result.retrievedAt))).toBe(false);
    await client.x.following();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledWith('POST', '/query', {
      body: {
        query: expect.stringContaining('xFollowing(first:'),
        variables: { first: 20, after: undefined },
      },
    });
  });
  it('forwards a bounded page and its opaque cursor', async () => {
    const { client, request } = setup();
    await client.x.following({ first: 100, after: 'opaque:next' });
    expect(request.mock.calls[0][2]?.body).toMatchObject({
      variables: { first: 100, after: 'opaque:next' },
    });
  });
  it('preserves empty intermediate pages and their continuation', async () => {
    const value = page([]);
    value.pageInfo.hasNextPage = true;
    value.pageInfo.endCursor = 'next';
    const { client } = setup(value);
    expect(await client.x.following()).toMatchObject(value);
  });
  it('returns a disconnected status as data and reads authored Posts separately', async () => {
    const { client, request } = setup();
    request.mockResolvedValueOnce({
      data: {
        viewer: {
          xConnection: {
            connected: false,
            canReadFollowing: false,
            canReadPosts: false,
          },
        },
      },
    });
    expect(await client.x.status()).toEqual({
      connected: false,
      canReadFollowing: false,
      canReadPosts: false,
    });
    request.mockResolvedValueOnce({
      data: {
        viewer: {
          xPosts: page([
            {
              cursor: 'opaque',
              node: {
                id: '999',
                authorId: '123',
                text: 'view',
                createdAt: '2026-10-22',
              },
            },
          ]),
        },
      },
    });
    expect((await client.x.posts()).edges[0]?.node.text).toBe('view');
    expect(request.mock.calls[1][2]?.body).toMatchObject({
      query: expect.stringContaining('xPosts(first:'),
    });
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
    const { client, request } = setup();
    await expect(client.x.following(params as XReadParams)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it('requires Alva authentication, never an X token from the agent', async () => {
    const client = new AlvaClient({});
    const request = vi.spyOn(client, '_request');
    await expect(client.x.following()).rejects.toThrow();
    await expect(client.x.status()).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it('fails closed on GraphQL errors even with partial data and preserves reason details', async () => {
    const { client, request } = setup();
    const errors = [
      { message: 'reconnect X', extensions: { reason: 'X_TOKEN_REVOKED' } },
    ];
    request.mockResolvedValue({
      data: { viewer: { xFollowing: page() } },
      errors,
    });
    await expect(client.x.following()).rejects.toMatchObject({
      code: 'GRAPHQL_ERROR',
      details: { errors },
    });
  });
  it.each([
    undefined,
    null,
    {},
    { edges: [], pageInfo: { hasNextPage: true, endCursor: '' } },
    page([{ cursor: 'opaque', node: { id: 123, username: 'x', name: 'X' } }]),
  ])('rejects broken success responses: %j', async (value) => {
    const { client, request } = setup();
    request.mockResolvedValue({ data: { viewer: { xFollowing: value } } });
    await expect(client.x.following()).rejects.toBeInstanceOf(AlvaError);
  });
});
