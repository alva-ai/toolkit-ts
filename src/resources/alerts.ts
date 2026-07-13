import type { AlvaClient } from '../client.js';
import type {
  FeedNotificationListResponse,
  FollowsListParams,
  FollowsListResponse,
  NotificationListParams,
  NotificationPreferencesResponse,
  NotificationPreferenceUpdateParams,
  NotificationPreferenceUpdateResponse,
  PushSubscriptionFeedParams,
  PushSubscriptionListParams,
  PushSubscriptionListResponse,
  SubscribeBatchParams,
  SubscribeBatchResponse,
  SubscribeFeedResponse,
  UnsubscribeBatchParams,
  UnsubscribeBatchResponse,
  UnsubscribeResponse,
} from '../types.js';

/**
 * Product-facing alert API. The current transport still calls the legacy
 * subscription and notification-history endpoints.
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
    params: PushSubscriptionFeedParams
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

  historyAutomation(
    params: NotificationListParams
  ): Promise<FeedNotificationListResponse> {
    return this.client.notifications.listFeed(params);
  }

  preferences(): Promise<NotificationPreferencesResponse> {
    return this.client.notificationPreferences.list();
  }

  updatePreference(
    params: NotificationPreferenceUpdateParams
  ): Promise<NotificationPreferenceUpdateResponse> {
    return this.client.notificationPreferences.update(params);
  }
}
