import { afterEach, describe, it, expect, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { fakeV2 } from '../fakeV2.js';
import {
  aPlaybookFollow,
  aSubscription,
  AUTOMATION,
  PLAYBOOK,
} from '../socialV2.js';

let restore: (() => void) | undefined;
afterEach(() => restore?.());

function client() {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

describe('SubscriptionsResource', () => {
  it('followPlaybook() and unfollowPlaybook() take the Playbook ID', async () => {
    const fake = fakeV2({
      'POST /me/followed-playbooks': () => aPlaybookFollow(),
      [`DELETE /me/followed-playbooks/${PLAYBOOK}`]: () =>
        aPlaybookFollow({ following: false, followedAt: null }),
    });
    restore = fake.restore;
    const c = client();
    expect(await c.subscriptions.followPlaybook(PLAYBOOK)).toEqual(
      aPlaybookFollow()
    );
    expect(await c.subscriptions.unfollowPlaybook(PLAYBOOK)).toMatchObject({
      following: false,
    });
    expect(fake.calls[0].body).toEqual({ playbookId: PLAYBOOK });
  });

  it('list() and follows() return their pages', async () => {
    const subscriptions = { items: [aSubscription()], nextPageToken: 'p2' };
    const follows = {
      items: [
        {
          id: PLAYBOOK,
          ownerUsername: 'alice',
          slug: 'btc-dashboard',
          displayName: 'BTC Dashboard',
          followedAt: null,
        },
      ],
      nextPageToken: null,
    };
    const fake = fakeV2({
      'GET /me/notification-subscriptions': () => subscriptions,
      'GET /me/followed-playbooks': () => follows,
    });
    restore = fake.restore;
    const c = client();
    expect(await c.subscriptions.list({ pageSize: 1 })).toEqual(subscriptions);
    expect(await c.subscriptions.follows({ pageToken: 't' })).toEqual(follows);
  });

  it('subscribeBatch() posts the Subscription and returns the SubscribeResponse', async () => {
    const answer = { subscriptions: [aSubscription()] };
    const fake = fakeV2({
      'POST /me/notification-subscriptions': () => answer,
    });
    restore = fake.restore;
    const body = { automationIds: [AUTOMATION], channelId: 'channel_0ch' };
    expect(await client().subscriptions.subscribeBatch(body)).toEqual(answer);
    expect(fake.calls[0].body).toEqual(body);
  });

  it('unsubscribeBatch() removes every destination of the automations', async () => {
    const other = aSubscription({
      id: 'notification_subscription_0x',
      automationId: 'automation_0x',
    });
    const email = aSubscription({
      id: 'notification_subscription_0e',
      channelId: 'channel_0ch',
    });
    const fake = fakeV2({
      'GET /me/notification-subscriptions': [
        () => ({ items: [aSubscription(), other], nextPageToken: 'p2' }),
        () => ({ items: [email], nextPageToken: null }),
      ],
      'DELETE /me/notification-subscriptions/notification_subscription_0n':
        () => ({ id: 'notification_subscription_0n' }),
      'DELETE /me/notification-subscriptions/notification_subscription_0e':
        () => ({ id: 'notification_subscription_0e' }),
    });
    restore = fake.restore;
    expect(await client().subscriptions.unsubscribeBatch([AUTOMATION])).toEqual(
      [
        { id: 'notification_subscription_0n' },
        { id: 'notification_subscription_0e' },
      ]
    );
    expect(fake.calls[1].query.get('pageToken')).toBe('p2');
    expect(fake.calls.filter((call) => call.method === 'DELETE')).toHaveLength(
      2
    );
  });
});

describe('client.v1.subscriptions', () => {
  it('subscribeFeed() and unsubscribeFeed() keep /api/v1 by owner and name', async () => {
    const c = new AlvaClient({ apiKey: 'key' });
    const request = vi.spyOn(c, '_request').mockResolvedValue({ ok: true });
    await c.v1.subscriptions.subscribeFeed({
      username: 'alice',
      name: 'btc ema',
      channelId: '7',
    });
    await c.v1.subscriptions.unsubscribeFeed({
      username: 'alice',
      name: 'btc ema',
    });
    expect(request.mock.calls).toEqual([
      [
        'POST',
        '/api/v1/subscriptions/feed/alice/btc%20ema',
        { body: { channel_id: '7' } },
      ],
      ['DELETE', '/api/v1/subscriptions/feed/alice/btc%20ema'],
    ]);
  });
});
