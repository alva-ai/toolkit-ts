import type { AlvaClient } from '../client.js';
import type { Schema, V2Query } from '../platformApi.js';
import type {
  FollowsListParams,
  FollowsListResponse,
  PushSubscriptionFeedParams,
  PushSubscriptionListParams,
  PushSubscriptionListResponse,
  SubscribeFeedParams,
  SubscribeBatchParams,
  SubscribeBatchResponse,
  SubscribeFeedResponse,
  UnsubscribeBatchParams,
  UnsubscribeBatchResponse,
  UnsubscribeResponse,
} from '../types.js';

/**
 * Product-facing alert API: delegates to the subscriptions, notifications and
 * notification preferences resources.
 */
export class AlertsResource {
  constructor(private client: AlvaClient) {}

  list(
    params: PushSubscriptionListParams = {}
  ): Promise<PushSubscriptionListResponse> {
    return this.client.subscriptions.list(params);
  }

  follows(params: FollowsListParams = {}): Promise<FollowsListResponse> {
    return this.client.subscriptions.follows(params);
  }

  enableAutomation(
    params: SubscribeFeedParams
  ): Promise<SubscribeFeedResponse> {
    return this.client.subscriptions.subscribeFeed(params);
  }

  disableAutomation(
    params: PushSubscriptionFeedParams
  ): Promise<UnsubscribeResponse> {
    return this.client.subscriptions.unsubscribeFeed(params);
  }

  enableBatch(params: SubscribeBatchParams): Promise<SubscribeBatchResponse> {
    return this.client.subscriptions.subscribeBatch(params);
  }

  disableBatch(
    params: UnsubscribeBatchParams
  ): Promise<UnsubscribeBatchResponse> {
    return this.client.subscriptions.unsubscribeBatch(params);
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
