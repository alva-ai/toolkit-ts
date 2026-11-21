import type { AlvaClient } from '../client.js';
import {
  collectAll,
  v2Path,
  type Schema,
  type V2Query,
} from '../platformApi.js';

export interface SubscriptionWriteOptions {
  /** Idempotency-Key of the write; a new UUID when omitted. */
  idempotencyKey?: string;
}

/**
 * Playbook follows and automation alert subscriptions.
 *
 * Three DISTINCT concepts share the word "subscribe" in the product; this
 * resource touches the first two and never the third:
 *
 *   - **follow** — the social relation ("Subscribed Playbooks" in the UI):
 *     `followPlaybook`, `unfollowPlaybook`, `follows`.
 *   - **alerts** — push/notification opt-ins, one NotificationSubscription
 *     per automation and destination: `list`, `subscribeBatch`,
 *     `unsubscribe`, `unsubscribeBatch`.
 *   - **purchase** — paid playbook access / the SaaS plan. NOT this resource.
 *
 * Subscribing to one feed by owner and name is
 * `client.v1.subscriptions.subscribeFeed` (/api/v2 takes Automation IDs).
 */
export class SubscriptionsResource {
  constructor(private client: AlvaClient) {}

  /** Follows a Playbook; alerts are independent. Idempotent. */
  async followPlaybook(
    playbookId: string,
    options: SubscriptionWriteOptions = {}
  ): Promise<Schema<'PlaybookFollow'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/me/followed-playbooks', {
      body: { playbookId },
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** Unfollows a Playbook without changing its alerts. Idempotent. */
  async unfollowPlaybook(
    playbookId: string
  ): Promise<Schema<'PlaybookFollow'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'DELETE',
      v2Path`/me/followed-playbooks/${playbookId}`
    );
  }

  /** One page of the Playbooks the caller follows. */
  async follows(
    query: V2Query<'/me/followed-playbooks', 'get'> = {}
  ): Promise<Schema<'FollowedPlaybookList'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/followed-playbooks', { query });
  }

  /** One page of the caller's alert subscriptions. */
  async list(
    query: V2Query<'/me/notification-subscriptions', 'get'> = {}
  ): Promise<Schema<'NotificationSubscriptionList'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/notification-subscriptions', {
      query,
    });
  }

  /**
   * Enables alerts of automations (at most 100) on one Alva channel, the
   * Agent channel when `channelId` is absent. Atomic.
   */
  async subscribeBatch(
    body: Schema<'Subscription'>,
    options: SubscriptionWriteOptions = {}
  ): Promise<Schema<'SubscribeResponse'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/me/notification-subscriptions', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** Removes one alert destination. */
  async unsubscribe(
    notificationSubscriptionId: string
  ): Promise<Schema<'Removed'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'DELETE',
      v2Path`/me/notification-subscriptions/${notificationSubscriptionId}`
    );
  }

  /**
   * Disables the alerts of automations on every channel: removes each of
   * their subscriptions and returns them. An automation without one
   * removes nothing.
   */
  async unsubscribeBatch(
    automationIds: string[]
  ): Promise<Schema<'Removed'>[]> {
    this.client._requireAuth();
    const wanted = new Set(automationIds);
    const subscriptions = await collectAll(
      this.client._v2Pages<Schema<'NotificationSubscription'>>(
        '/me/notification-subscriptions',
        { pageSize: 200 }
      )
    );
    const removed: Schema<'Removed'>[] = [];
    for (const s of subscriptions) {
      if (wanted.has(s.automationId))
        removed.push(await this.unsubscribe(s.id));
    }
    return removed;
  }
}
