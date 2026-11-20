import type { AlvaClient } from '../client.js';
import type {
  PushSubscriptionFeedParams,
  SubscribeFeedParams,
  SubscribeFeedResponse,
  UnsubscribeResponse,
} from '../types.js';

/**
 * Alerts of one feed named by owner and name, which /api/v2 cannot address
 * (it takes Automation IDs: `subscriptions.subscribeBatch`).
 */
export class V1SubscriptionsResource {
  constructor(private client: AlvaClient) {}

  /**
   * Subscribe to one feed `(username, name)` — enable personal push for that
   * single automation's alerts, regardless of which playbook(s) consume it.
   * Does NOT follow any playbook. Idempotent.
   */
  async subscribeFeed(
    params: SubscribeFeedParams
  ): Promise<SubscribeFeedResponse> {
    this.client._requireAuth();
    const path = `/api/v1/subscriptions/feed/${encodeURIComponent(params.username)}/${encodeURIComponent(params.name)}`;
    if (params.channelId === undefined) {
      return this.client._request(
        'POST',
        path
      ) as Promise<SubscribeFeedResponse>;
    }
    return this.client._request('POST', path, {
      body: { channel_id: params.channelId },
    }) as Promise<SubscribeFeedResponse>;
  }

  /**
   * Unsubscribe from one feed `(username, name)` — disable that automation's
   * alerts for the caller. Idempotent.
   */
  async unsubscribeFeed(
    params: PushSubscriptionFeedParams
  ): Promise<UnsubscribeResponse> {
    this.client._requireAuth();
    const path = `/api/v1/subscriptions/feed/${encodeURIComponent(params.username)}/${encodeURIComponent(params.name)}`;
    return this.client._request('DELETE', path) as Promise<UnsubscribeResponse>;
  }
}
