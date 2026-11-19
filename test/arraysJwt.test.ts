import { afterEach, describe, it, expect, vi } from 'vitest';
import { AlvaClient } from '../src/client.js';
import { AlvaError } from '../src/error.js';
import { ArraysJwtResource } from '../src/resources/arraysJwt.js';
import { fakeV2 } from './fakeV2.js';

let restore = () => {};
afterEach(() => restore());

function resource(config = { apiKey: 'alva_test' }) {
  return new ArraysJwtResource(new AlvaClient(config));
}

describe('ArraysJwtResource.ensure', () => {
  it('refreshes the data-skills token and rebuilds Unix seconds and the tier name', async () => {
    const fake = fakeV2({
      'POST /me/data-skills-token/refresh': () => ({
        expiresAt: '2026-12-01T00:00:00.000Z',
        tier: 'PRO',
        renewed: true,
      }),
    });
    restore = fake.restore;

    await expect(resource().ensure()).resolves.toEqual({
      expires_at: Date.UTC(2026, 11, 1) / 1000,
      tier: 'SUBSCRIPTION_TIER_PRO',
      renewed: true,
    });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].body).toBeUndefined();
  });

  it('requires auth — throws UNAUTHENTICATED before any request', async () => {
    const client = new AlvaClient({});
    const requestSpy = vi.spyOn(client, '_v2Request');
    const r = new ArraysJwtResource(client);

    await expect(r.ensure()).rejects.toMatchObject({
      name: 'AlvaError',
      code: 'UNAUTHENTICATED',
    });
    await expect(r.ensure()).rejects.toBeInstanceOf(AlvaError);
    expect(requestSpy).not.toHaveBeenCalled();
  });
});

describe('ArraysJwtResource.status', () => {
  it('reads the data-skills token state', async () => {
    restore = fakeV2({
      'GET /me/data-skills-token': () => ({
        exists: true,
        expiresAt: '1970-01-01T00:07:36.900Z',
        tier: 'MAX',
        renewalNeeded: false,
      }),
    }).restore;

    await expect(resource().status()).resolves.toEqual({
      exists: true,
      expires_at: 456,
      tier: 'SUBSCRIPTION_TIER_MAX',
      renewal_needed: false,
    });
  });

  it('reads a missing token as expiry 0 and an unspecified tier', async () => {
    restore = fakeV2({
      'GET /me/data-skills-token': () => ({
        exists: false,
        expiresAt: null,
        tier: null,
        renewalNeeded: true,
      }),
    }).restore;

    await expect(resource().status()).resolves.toEqual({
      exists: false,
      expires_at: 0,
      tier: 'SUBSCRIPTION_TIER_UNSPECIFIED',
      renewal_needed: true,
    });
  });

  it('requires auth — throws UNAUTHENTICATED before any request', async () => {
    const client = new AlvaClient({});
    const requestSpy = vi.spyOn(client, '_v2Request');
    const r = new ArraysJwtResource(client);

    await expect(r.status()).rejects.toMatchObject({
      name: 'AlvaError',
      code: 'UNAUTHENTICATED',
    });
    await expect(r.status()).rejects.toBeInstanceOf(AlvaError);
    expect(requestSpy).not.toHaveBeenCalled();
  });
});
