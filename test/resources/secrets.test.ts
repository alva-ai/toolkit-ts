import { afterEach, describe, it, expect, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { aSecret, REQUEST_ID } from '../accountV2.js';
import { fakeV2 } from '../fakeV2.js';

let restore: (() => void) | undefined;
afterEach(() => restore?.());

function client() {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

describe('SecretsResource', () => {
  it('create() posts a secret that must not exist and returns the Secret', async () => {
    const fake = fakeV2({ 'POST /me/secrets': () => aSecret() });
    restore = fake.restore;
    expect(
      await client().secrets.create(
        { name: 'KEY', value: 'val' },
        { idempotencyKey: REQUEST_ID }
      )
    ).toEqual(aSecret());
    expect(fake.calls[0].body).toEqual({
      name: 'KEY',
      value: 'val',
      mustExist: false,
    });
    expect(fake.calls[0].headers['Idempotency-Key']).toBe(`"${REQUEST_ID}"`);
  });

  it('update() posts a secret that must exist', async () => {
    const fake = fakeV2({ 'POST /me/secrets': () => aSecret() });
    restore = fake.restore;
    await client().secrets.update({ name: 'KEY', value: 'new' });
    expect(fake.calls[0].body).toEqual({
      name: 'KEY',
      value: 'new',
      mustExist: true,
    });
  });

  it('list() returns one SecretList page', async () => {
    const page = { items: [aSecret()], nextPageToken: 'p2' };
    const fake = fakeV2({ 'GET /me/secrets': () => page });
    restore = fake.restore;
    expect(await client().secrets.list({ pageSize: 1 })).toEqual(page);
    expect(fake.calls[0].query.get('pageSize')).toBe('1');
  });

  it('delete() deletes by Secret ID', async () => {
    const fake = fakeV2({ 'DELETE /me/secrets/secret_0k1': () => ({}) });
    restore = fake.restore;
    expect(await client().secrets.delete('secret_0k1')).toEqual({});
  });
});

describe('client.v1.secrets', () => {
  it('get() reads the value from /api/v1 with its 0.x shape', async () => {
    const value = {
      name: 'A/B',
      value: 'v',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    };
    const fetch = vi.fn(async (url: string) => {
      void url;
      return Response.json(value);
    });
    vi.stubGlobal('fetch', fetch);
    restore = () => vi.unstubAllGlobals();
    expect(await client().v1.secrets.get({ name: 'A/B' })).toEqual(value);
    expect(fetch.mock.calls[0][0]).toBe(
      'https://api.test/api/v1/secrets/A%2FB'
    );
  });
});
