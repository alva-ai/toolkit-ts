import { afterEach, describe, it, expect, vi } from 'vitest';
import { AlvaClient } from '../src/client.js';
import { AlvaError } from '../src/error.js';
import { ArraysJwtResource } from '../src/resources/arraysJwt.js';
import { fakeV2 } from './fakeV2.js';
import { dataSkillsToken, dataSkillsTokenRefresh } from './runtimeV2.js';

let restore = () => {};
afterEach(() => restore());

function resource(config = { apiKey: 'alva_test' }) {
  return new ArraysJwtResource(new AlvaClient(config));
}

describe('ArraysJwtResource.ensure', () => {
  it('refreshes the data-skills token and returns the refresh unchanged', async () => {
    const fake = fakeV2({
      'POST /me/data-skills-token/refresh': () => dataSkillsTokenRefresh(),
    });
    restore = fake.restore;

    await expect(resource().ensure()).resolves.toEqual(
      dataSkillsTokenRefresh()
    );
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
  it.each([
    dataSkillsToken(),
    dataSkillsToken({
      exists: false,
      expiresAt: null,
      tier: null,
      renewalNeeded: true,
    }),
  ])('returns the token state unchanged: %j', async (token) => {
    restore = fakeV2({ 'GET /me/data-skills-token': () => token }).restore;

    await expect(resource().status()).resolves.toEqual(token);
  });
});
