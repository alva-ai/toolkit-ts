import type { AlvaClient } from '../client.js';
import type {
  FeedNotificationListResponse,
  NotificationListParams,
  NotificationPreferencesResponse,
  NotificationPreferenceUpdateParams,
  NotificationPreferenceUpdateResponse,
  PlaybookNotificationListResponse,
  PushSubscriptionFeedParams,
  PushSubscriptionListParams,
  PushSubscriptionListResponse,
  PushSubscriptionPlaybookParams,
  SubscribeFeedResponse,
  SubscribePlaybookResponse,
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

  enablePlaybook(
    params: PushSubscriptionPlaybookParams
  ): Promise<SubscribePlaybookResponse> {
    return this.client.subscriptions.subscribePlaybook(params);
  }

  disablePlaybook(
    params: PushSubscriptionPlaybookParams
  ): Promise<UnsubscribeResponse> {
    return this.client.subscriptions.unsubscribePlaybook(params);
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

  historyPlaybook(
    params: NotificationListParams
  ): Promise<PlaybookNotificationListResponse> {
    return this.client.notifications.listPlaybook(params);
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
