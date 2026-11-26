import type { AlvaClient } from '../client.js';
import type { Schema, V2Query } from '../platformApi.js';

/**
 * Product-facing alert API: delegates to the subscriptions, notifications and
 * notification preferences resources. Enabling one feed by owner and name is
 * `client.v1.subscriptions.subscribeFeed`.
 */
export class AlertsResource {
  constructor(private client: AlvaClient) {}

  list(
    query: V2Query<'/me/notification-subscriptions', 'get'> = {}
  ): Promise<Schema<'NotificationSubscriptionList'>> {
    return this.client.subscriptions.list(query);
  }

  follows(
    query: V2Query<'/me/followed-playbooks', 'get'> = {}
  ): Promise<Schema<'FollowedPlaybookList'>> {
    return this.client.subscriptions.follows(query);
  }

  enableBatch(
    body: Schema<'Subscription'>
  ): Promise<Schema<'SubscribeResponse'>> {
    return this.client.subscriptions.subscribeBatch(body);
  }

  disableBatch(automationIds: string[]): Promise<Schema<'Removed'>[]> {
    return this.client.subscriptions.unsubscribeBatch(automationIds);
  }

  history(
    query: V2Query<'/me/notification-deliveries', 'get'>
  ): Promise<Schema<'NotificationDeliveryList'>> {
    return this.client.notifications.list(query);
  }

  preferences(): Promise<Schema<'NotificationPreferences'>> {
    return this.client.notificationPreferences.get();
  }

  updatePreferences(
    patch: Schema<'NotificationPreferencesPatch'>
  ): Promise<Schema<'NotificationPreferences'>> {
    return this.client.notificationPreferences.update(patch);
  }
}
