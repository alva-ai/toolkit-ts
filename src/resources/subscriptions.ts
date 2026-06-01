import type { AlvaClient } from '../client.js';
import type {
  PushSubscriptionFeedParams,
  PushSubscriptionListParams,
  PushSubscriptionListResponse,
  PushSubscriptionPlaybookParams,
  SubscribeFeedResponse,
  SubscribePlaybookResponse,
  UnsubscribeResponse,
} from '../types.js';

/**
 * Subscriptions — subscribe the caller to playbooks and feeds.
 *
 *   - `subscribePlaybook` is a CASCADE: it follows the playbook AND enables
 *     personal push for every push-enabled automation of its latest release,
 *     in one call. `unsubscribePlaybook` reverses both (unfollow + disable
 *     all of the playbook's push alerts).
 *   - `subscribeFeed` / `unsubscribeFeed` toggle personal push for ONE feed
 *     (a single automation's alert) without touching the playbook follow.
 *
 * Backed by alva-gateway REST under `/api/v1/subscriptions/...`.
 */
export class SubscriptionsResource {
  constructor(private client: AlvaClient) {}

  /**
   * Subscribe to a playbook `(username, name)`: follow it and enable alerts
   * on all its push-enabled automations. Idempotent. Auth: the caller must be
   * able to read the playbook — public passes; paid requires an active unlock;
   * private requires owner/admin.
   */
  async subscribePlaybook(
    params: PushSubscriptionPlaybookParams
  ): Promise<SubscribePlaybookResponse> {
    this.client._requireAuth();
    const path = `/api/v1/subscriptions/playbook/${encodeURIComponent(params.username)}/${encodeURIComponent(params.name)}`;
    return this.client._request(
      'POST',
      path
    ) as Promise<SubscribePlaybookResponse>;
  }

  /**
   * Unsubscribe from a playbook `(username, name)`: unfollow it and disable
   * all of its push alerts for the caller. Idempotent.
   */
  async unsubscribePlaybook(
    params: PushSubscriptionPlaybookParams
  ): Promise<UnsubscribeResponse> {
    this.client._requireAuth();
    const path = `/api/v1/subscriptions/playbook/${encodeURIComponent(params.username)}/${encodeURIComponent(params.name)}`;
    return this.client._request('DELETE', path) as Promise<UnsubscribeResponse>;
  }

  /**
   * Subscribe to one feed `(username, name)` — enable personal push for that
   * single automation's alerts, regardless of which playbook(s) consume it.
   * Does NOT follow any playbook. Idempotent.
   */
  async subscribeFeed(
    params: PushSubscriptionFeedParams
  ): Promise<SubscribeFeedResponse> {
    this.client._requireAuth();
    const path = `/api/v1/subscriptions/feed/${encodeURIComponent(params.username)}/${encodeURIComponent(params.name)}`;
    return this.client._request('POST', path) as Promise<SubscribeFeedResponse>;
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

  /**
   * List the caller's currently active subscriptions.
   * Results are cursor-paginated.
   */
  async list(
    params: PushSubscriptionListParams = {}
  ): Promise<PushSubscriptionListResponse> {
    this.client._requireAuth();
    const query: Record<string, string> = {};
    if (params.first !== undefined && params.first > 0) {
      query.first = String(params.first);
    }
    if (params.cursor) query.cursor = params.cursor;
    return this.client._request('GET', '/api/v1/me/subscriptions', {
      query,
    }) as Promise<PushSubscriptionListResponse>;
  }
}
