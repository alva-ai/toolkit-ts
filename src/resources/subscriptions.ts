import type { AlvaClient } from '../client.js';
import type {
  FollowsListParams,
  FollowsListResponse,
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
 * Subscriptions — subscribe the caller to playbooks and feeds.
 *
 * Three DISTINCT concepts share the word "subscribe" in the product; this
 * resource touches the first two and never the third:
 *
 *   - **follow** — the social relation ("Subscribed Playbooks" in the UI).
 *     Enumerate with `follows()`.
 *   - **alerts** — push/notification opt-ins (what `list()` returns).
 *   - **purchase** — paid playbook access / the SaaS plan. NOT this resource.
 *
 * Operations:
 *   - `subscribePlaybook` is a CASCADE: it follows the playbook AND enables
 *     personal push for every push-enabled automation of its latest release,
 *     in one call. `unsubscribePlaybook` reverses both (unfollow + disable
 *     the playbook-level alert) and reports exactly what it changed.
 *   - `subscribeFeed` / `unsubscribeFeed` toggle personal push for ONE feed
 *     (a single automation's alert) without touching the playbook follow.
 *   - `unsubscribeBatch` disables alerts by TARGET ID — bulk, idempotent,
 *     and the only way to clear ghost rows whose target was deleted
 *     (name-addressed unsubscribe 404s on deleted playbooks).
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

  /**
   * List the playbooks the caller FOLLOWS (the social relation — the UI's
   * "Subscribed Playbooks"). Rows carry the playbook identity; follows of
   * deleted playbooks are filtered server-side. Cursor-paginated.
   */
  async follows(params: FollowsListParams = {}): Promise<FollowsListResponse> {
    this.client._requireAuth();
    const query: Record<string, string> = {};
    if (params.limit !== undefined && params.limit > 0) {
      query.limit = String(params.limit);
    }
    if (params.cursor) query.cursor = params.cursor;
    return this.client._request('GET', '/api/v1/me/follows', {
      query,
    }) as Promise<FollowsListResponse>;
  }

  /**
   * Disable alerts for many playbook/feed targets BY TARGET ID in one
   * idempotent call (max 100 ids). Ids are strings (snowflake-safe). Works
   * for ghost rows (deleted targets) because no name resolution happens —
   * the per-id results report `INVALID_ID` for malformed entries while
   * valid ones proceed. Safe to re-run: already-gone rows are no-ops.
   */
  async unsubscribeBatch(
    params: UnsubscribeBatchParams
  ): Promise<UnsubscribeBatchResponse> {
    this.client._requireAuth();
    return this.client._request(
      'POST',
      '/api/v1/subscriptions/unsubscribe-batch',
      {
        body: {
          playbook_ids: params.playbookIds ?? [],
          feed_ids: params.feedIds ?? [],
        },
      }
    ) as Promise<UnsubscribeBatchResponse>;
  }
}
