import { describe, it, expect } from 'vitest';
import { v2Client } from '../helpers/v2Client.js';
import type { V2RequestOptions } from '../../src/platformApi.js';

const SECRET = {
  id: 'secret_0k1',
  name: 'KEY',
  version: 2,
  prefix: 'sk-',
  valueLength: 12,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
};

describe('SecretsResource', () => {
  it('create sends POST /api/v2/me/secrets that must not overwrite', async () => {
    const { client, v2 } = v2Client({ 'POST /me/secrets': SECRET });
    await client.secrets.create({ name: 'KEY', value: 'val' });
    expect(v2).toHaveBeenCalledWith('POST', '/me/secrets', {
      body: { name: 'KEY', value: 'val', mustExist: false },
    });
  });

  it('update sends POST /api/v2/me/secrets that must exist', async () => {
    const { client, v2 } = v2Client({ 'POST /me/secrets': SECRET });
    await client.secrets.update({ name: 'KEY', value: 'new-val' });
    expect(v2).toHaveBeenCalledWith('POST', '/me/secrets', {
      body: { name: 'KEY', value: 'new-val', mustExist: true },
    });
  });

  it('list reads every page and keeps the v1 metadata names', async () => {
    const { client, v2 } = v2Client({
      'GET /me/secrets': (o: V2RequestOptions) =>
        o.query?.pageToken === undefined
          ? { items: [SECRET], nextPageToken: 'p2' }
          : {
              items: [{ ...SECRET, id: 'secret_0k2', name: 'B' }],
              nextPageToken: null,
            },
    });
    expect(await client.secrets.list()).toEqual({
      secrets: [
        {
          id: 'secret_0k1',
          name: 'KEY',
          keyVersion: 2,
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-02T00:00:00.000Z',
          valueLength: 12,
          keyPrefix: 'sk-',
        },
        expect.objectContaining({ id: 'secret_0k2', name: 'B' }),
      ],
    });
    expect(v2.mock.calls[0][2]).toEqual({
      query: { pageSize: 200, pageToken: undefined },
      timeoutMs: undefined,
      signal: undefined,
    });
  });

  it('get keeps the v1 value read', async () => {
    const { client, legacy } = v2Client({});
    legacy.mockResolvedValue({ name: 'KEY', value: 'v' } as never);
    await client.secrets.get({ name: 'A/B' });
    expect(legacy).toHaveBeenCalledWith('GET', '/api/v1/secrets/A%2FB');
  });

  it('delete finds the secret by name and deletes its ID', async () => {
    const { client, v2 } = v2Client({
      'GET /me/secrets': {
        items: [{ ...SECRET, id: 'secret_0other', name: 'OTHER' }, SECRET],
        nextPageToken: null,
      },
      'DELETE /me/secrets/secret_0k1': {},
    });
    await client.secrets.delete({ name: 'KEY' });
    expect(v2).toHaveBeenLastCalledWith('DELETE', '/me/secrets/secret_0k1');
  });

  it('delete of an unknown name is NOT_FOUND without a delete', async () => {
    const { client, v2 } = v2Client({
      'GET /me/secrets': { items: [SECRET], nextPageToken: null },
    });
    await expect(client.secrets.delete({ name: 'NOPE' })).rejects.toMatchObject(
      { code: 'NOT_FOUND', status: 404 }
    );
    expect(v2).toHaveBeenCalledTimes(1);
  });
});
