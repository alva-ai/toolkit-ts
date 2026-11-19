import { describe, it, expect } from 'vitest';
import type { V2RequestOptions } from '../../src/platformApi.js';
import { v2Client } from '../helpers/v2Client.js';

const SUBSCRIPTION = {
  id: 'notification_subscription_0s1',
  automationId: 'automation_0a',
  automationName: 'btc-ema',
  automationStatus: 'ACTIVE',
  targetStatus: 'ACTIVE',
  medium: 'CHANNEL',
  channelId: 'channel_0c',
  usedBy: [
    {
      playbookId: 'playbook_0p',
      ownerUsername: 'alice',
      slug: 'btc-dashboard',
      displayName: 'BTC Dashboard',
      ownerAvatarUrl: null,
    },
  ],
  usedByCount: 1,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
  lastDeliveredAt: '2026-11-03T00:00:00.000Z',
};

const ALERT = {
  id: 'notification_subscription_0s1',
  target: { type: 'FEED', id: 'automation_0a' },
  created_at_ms: Date.parse('2026-11-01T00:00:00.000Z'),
  updated_at_ms: Date.parse('2026-11-02T00:00:00.000Z'),
  channel_id: 'channel_0c',
  feed_name: 'btc-ema',
  feed_status: 'ACTIVE',
  last_pushed_at_ms: Date.parse('2026-11-03T00:00:00.000Z'),
  used_by: [
    {
      playbook_id: 'playbook_0p',
      owner_username: 'alice',
      playbook_name: 'btc-dashboard',
      display_name: 'BTC Dashboard',
      owner_avatar_url: '',
    },
  ],
  used_by_total: 1,
  kind: 'FEED_ALERT',
  target_status: 'ACTIVE',
};

const FOLLOW = {
  changed: true,
  following: true,
  followedAt: '2026-11-19T10:00:00.000Z',
  playbook: {
    id: 'playbook_0p',
    ownerUsername: 'alice',
    slug: 'btc-dashboard',
    displayName: 'BTC Dashboard',
  },
};

describe('SubscriptionsResource', () => {
  it('followPlaybook() looks the Playbook up by slug and follows its ID', async () => {
    const { client, v2 } = v2Client({
      'GET /playbooks/by-slug/alice/btc-dashboard': { id: 'playbook_0p' },
      'POST /me/followed-playbooks': FOLLOW,
    });
    expect(
      await client.subscriptions.followPlaybook({
        username: 'alice',
        name: 'btc-dashboard',
      })
    ).toEqual({
      follow: {
        playbook_id: 'playbook_0p',
        created_at_ms: Date.parse('2026-11-19T10:00:00.000Z'),
        updated_at_ms: Date.parse('2026-11-19T10:00:00.000Z'),
      },
      playbook_path: '/alva/home/alice/playbooks/btc-dashboard',
      playbook_id: 'playbook_0p',
    });
    expect(v2).toHaveBeenLastCalledWith('POST', '/me/followed-playbooks', {
      body: { playbookId: 'playbook_0p' },
    });
  });

  it('unfollowPlaybook() reports whether the follow changed', async () => {
    const { client } = v2Client({
      'GET /playbooks/by-slug/alice/btc-dashboard': { id: 'playbook_0p' },
      'DELETE /me/followed-playbooks/playbook_0p': {
        ...FOLLOW,
        changed: false,
        following: false,
      },
    });
    await expect(
      client.subscriptions.unfollowPlaybook({
        username: 'alice',
        name: 'btc-dashboard',
      })
    ).resolves.toEqual({ ok: true, unfollowed: false });
  });

  it('follows() pages the followed Playbooks with the v1 names', async () => {
    const { client, v2 } = v2Client({
      'GET /me/followed-playbooks': (o: V2RequestOptions) => ({
        items: [
          {
            id: 'playbook_0p',
            ownerUsername: 'alice',
            slug: 'btc-dashboard',
            displayName: 'BTC Dashboard',
            followedAt: '2026-11-19T10:00:00.000Z',
          },
        ],
        nextPageToken: o.query?.pageToken ? null : 'n',
      }),
    });
    expect(await client.subscriptions.follows({ limit: 20 })).toEqual({
      items: [
        {
          playbook_id: 'playbook_0p',
          owner_username: 'alice',
          name: 'btc-dashboard',
          display_name: 'BTC Dashboard',
          followed_at_ms: Date.parse('2026-11-19T10:00:00.000Z'),
        },
      ],
      has_next: true,
      next_cursor: 'n',
    });
    const last = await client.subscriptions.follows({ cursor: 'n' });
    expect(last).toMatchObject({ has_next: false });
    expect(last).not.toHaveProperty('next_cursor');
    expect(v2.mock.calls.map((c) => c[2]?.query)).toEqual([
      { pageSize: 20, pageToken: undefined },
      { pageSize: undefined, pageToken: 'n' },
    ]);
  });

  it('list() rebuilds the v1 alert rows; no channel is the agent channel 0', async () => {
    const { client, v2 } = v2Client({
      'GET /me/notification-subscriptions': {
        items: [
          SUBSCRIPTION,
          {
            ...SUBSCRIPTION,
            id: 'notification_subscription_0s2',
            automationName: null,
            channelId: null,
            lastDeliveredAt: null,
            usedBy: [],
            usedByCount: 0,
          },
        ],
        nextPageToken: null,
      },
    });
    const { items, next_cursor } = await client.subscriptions.list({
      first: 50,
      cursor: 'c1',
    });
    expect(items[0]).toEqual(ALERT);
    expect(items[1]).toEqual({
      id: 'notification_subscription_0s2',
      target: { type: 'FEED', id: 'automation_0a' },
      created_at_ms: ALERT.created_at_ms,
      updated_at_ms: ALERT.updated_at_ms,
      channel_id: '0',
      feed_status: 'ACTIVE',
      used_by: [],
      used_by_total: 0,
      kind: 'FEED_ALERT',
      target_status: 'ACTIVE',
    });
    expect(next_cursor).toBe('');
    expect(v2).toHaveBeenCalledWith('GET', '/me/notification-subscriptions', {
      query: { pageSize: 50, pageToken: 'c1' },
    });
  });

  it('subscribeBatch() posts Automation IDs; channel 0 is the agent channel', async () => {
    const { client, v2 } = v2Client({
      'POST /me/notification-subscriptions': { subscriptions: [SUBSCRIPTION] },
    });
    expect(
      await client.subscriptions.subscribeBatch({
        feedIds: ['automation_0a'],
        channelId: 'channel_0c',
      })
    ).toEqual({ subscriptions: [ALERT] });
    await client.subscriptions.subscribeBatch({
      feedIds: ['automation_0a'],
      channelId: '0',
    });
    expect(v2.mock.calls.map((c) => c[2]?.body)).toEqual([
      { automationIds: ['automation_0a'], channelId: 'channel_0c' },
      { automationIds: ['automation_0a'], channelId: undefined },
    ]);
  });

  it('unsubscribeBatch() deletes every destination of the named Automations', async () => {
    const other = {
      ...SUBSCRIPTION,
      id: 'notification_subscription_0o',
      automationId: 'automation_0other',
    };
    const { client, v2 } = v2Client({
      'GET /me/notification-subscriptions': (o: V2RequestOptions) =>
        o.query?.pageToken === undefined
          ? { items: [SUBSCRIPTION, other], nextPageToken: 'p2' }
          : {
              items: [
                {
                  ...SUBSCRIPTION,
                  id: 'notification_subscription_0s2',
                  channelId: null,
                },
              ],
              nextPageToken: null,
            },
      'DELETE /me/notification-subscriptions/notification_subscription_0s1': {
        id: 'notification_subscription_0s1',
      },
      'DELETE /me/notification-subscriptions/notification_subscription_0s2': {
        id: 'notification_subscription_0s2',
      },
    });
    expect(
      await client.subscriptions.unsubscribeBatch({
        feedIds: ['automation_0a', 'automation_0none'],
      })
    ).toEqual({
      results: [
        { id: 'automation_0a', kind: 'FEED', ok: true, status: 'UNSUBSCRIBED' },
        {
          id: 'automation_0none',
          kind: 'FEED',
          ok: true,
          status: 'UNSUBSCRIBED',
        },
      ],
      ok_count: 2,
    });
    expect(
      v2.mock.calls.filter(([m]) => m === 'DELETE').map(([, p]) => p)
    ).toEqual([
      '/me/notification-subscriptions/notification_subscription_0s1',
      '/me/notification-subscriptions/notification_subscription_0s2',
    ]);
  });

  it('subscribeFeed() and unsubscribeFeed() keep the v1 routes by owner and name', async () => {
    const { client, legacy } = v2Client({});
    legacy.mockResolvedValue({} as never);
    await client.subscriptions.subscribeFeed({
      username: 'alice',
      name: 'btc-ema',
      channelId: '42',
    });
    await client.subscriptions.subscribeFeed({
      username: 'alice',
      name: 'btc-ema',
    });
    await client.subscriptions.unsubscribeFeed({
      username: 'alice',
      name: 'btc-ema',
    });
    expect(legacy.mock.calls).toEqual([
      [
        'POST',
        '/api/v1/subscriptions/feed/alice/btc-ema',
        { body: { channel_id: '42' } },
      ],
      ['POST', '/api/v1/subscriptions/feed/alice/btc-ema'],
      ['DELETE', '/api/v1/subscriptions/feed/alice/btc-ema'],
    ]);
  });
});
