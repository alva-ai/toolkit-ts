import { afterEach, describe, it, expect } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { aGrant, aServiceAccount, REQUEST_ID } from '../accountV2.js';
import { fakeV2 } from '../fakeV2.js';

let restore: (() => void) | undefined;
afterEach(() => restore?.());

function client() {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

describe('ServiceAccountResource', () => {
  it('create() posts the body and returns the ServiceAccount', async () => {
    const fake = fakeV2({
      'POST /me/service-accounts': () => aServiceAccount(),
    });
    restore = fake.restore;
    expect(
      await client().serviceAccount.create(
        { displayName: 'fintwit-bot' },
        { idempotencyKey: REQUEST_ID }
      )
    ).toEqual(aServiceAccount());
    expect(fake.calls[0].body).toEqual({ displayName: 'fintwit-bot' });
    expect(fake.calls[0].headers['Idempotency-Key']).toBe(`"${REQUEST_ID}"`);
  });

  it('list() returns one ServiceAccountList page', async () => {
    const page = { items: [aServiceAccount()], nextPageToken: null };
    const fake = fakeV2({ 'GET /me/service-accounts': () => page });
    restore = fake.restore;
    expect(await client().serviceAccount.list()).toEqual(page);
  });

  it('grant() posts the grant under the account and returns it', async () => {
    const fake = fakeV2({
      'POST /me/service-accounts/account_0sa/grants': () => aGrant(),
    });
    restore = fake.restore;
    expect(
      await client().serviceAccount.grant('account_0sa', {
        path: '~/feeds/x/',
        permission: 'READ',
      })
    ).toEqual(aGrant());
    expect(fake.calls[0].body).toEqual({
      path: '~/feeds/x/',
      permission: 'READ',
    });
  });

  it('delete() and revoke() address the account and the grant by ID', async () => {
    const fake = fakeV2({
      'DELETE /me/service-accounts/account_0sa': () => ({}),
      'DELETE /me/service-accounts/account_0sa/grants/service_account_grant_0g':
        () => ({}),
    });
    restore = fake.restore;
    const c = client();
    await c.serviceAccount.revoke('account_0sa', 'service_account_grant_0g');
    await c.serviceAccount.delete('account_0sa');
    expect(fake.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'DELETE /me/service-accounts/account_0sa/grants/service_account_grant_0g',
      'DELETE /me/service-accounts/account_0sa',
    ]);
  });
});
