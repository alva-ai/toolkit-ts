import { describe, it, expect } from 'vitest';
import { v2Client } from '../helpers/v2Client.js';

const SA = {
  id: 'account_0sa',
  displayName: 'fintwit-bot',
  username: 'alice-sa-1',
  ownerId: 'account_0alice',
  createdAt: '2026-11-19T10:00:00.000Z',
};

describe('ServiceAccountResource', () => {
  it('create maps the v2 ServiceAccount to the v1 shape', async () => {
    const { client, v2 } = v2Client({ 'POST /me/service-accounts': SA });
    expect(
      await client.serviceAccount.create({ display_name: 'fintwit-bot' })
    ).toEqual({
      service_account: {
        id: 'account_0sa',
        display_name: 'fintwit-bot',
        username: 'alice-sa-1',
        parent_user_id: 'account_0alice',
        created_at: Date.parse('2026-11-19T10:00:00.000Z'),
      },
    });
    expect(v2).toHaveBeenCalledWith('POST', '/me/service-accounts', {
      body: { displayName: 'fintwit-bot' },
    });
  });

  it('list reads every page and omits an unknown creation time', async () => {
    const { client } = v2Client({
      'GET /me/service-accounts': {
        items: [{ ...SA, createdAt: null }],
        nextPageToken: null,
      },
    });
    const { service_accounts } = await client.serviceAccount.list();
    expect(service_accounts).toEqual([
      {
        id: 'account_0sa',
        display_name: 'fintwit-bot',
        username: 'alice-sa-1',
        parent_user_id: 'account_0alice',
      },
    ]);
  });

  it('delete sends the Account ID as one path segment', async () => {
    const { client, v2 } = v2Client({
      'DELETE /me/service-accounts/account_0sa': {},
    });
    await client.serviceAccount.delete({ id: 'account_0sa' });
    expect(v2).toHaveBeenCalledWith(
      'DELETE',
      '/me/service-accounts/account_0sa'
    );
  });

  it('grant upper-cases the permission and returns the grant', async () => {
    const { client, v2 } = v2Client({
      'POST /me/service-accounts/account_0sa/grants': {
        id: 'service_account_grant_0g',
        serviceAccountId: 'account_0sa',
        path: '/alva/home/alice/feeds/x/v1',
        permission: 'READ',
      },
    });
    expect(
      await client.serviceAccount.grant({
        id: 'account_0sa',
        path: '~/feeds/x/v1',
        permission: 'read',
      })
    ).toEqual({
      id: 'service_account_grant_0g',
      service_account_id: 'account_0sa',
      path: '/alva/home/alice/feeds/x/v1',
      permission: 'read',
    });
    expect(v2.mock.calls[0][2]).toEqual({
      body: { path: '~/feeds/x/v1', permission: 'READ' },
    });
  });

  it('revoke deletes the grant by its ID', async () => {
    const { client, v2 } = v2Client({
      'DELETE /me/service-accounts/account_0sa/grants/service_account_grant_0g':
        {},
    });
    await client.serviceAccount.revoke({
      id: 'account_0sa',
      grant_id: 'service_account_grant_0g',
    });
    expect(v2).toHaveBeenCalledTimes(1);
  });
});
