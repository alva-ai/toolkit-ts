import type { AlvaClient } from '../client.js';
import type {
  FollowsListParams,
  FollowsListResponse,
  FollowPlaybookResponse,
  PlaybookFollowParams,
  PushSubscriptionFeedParams,
  PushSubscriptionListParams,
  PushSubscriptionListResponse,
  SubscribeBatchParams,
  SubscribeBatchResponse,
  SubscribeFeedResponse,
  UnsubscribeBatchParams,
  UnsubscribeBatchResponse,
  UnsubscribeResponse,
  UnfollowPlaybookResponse,
} from '../types.js';

/**
 * Playbook follows and FEED alert subscriptions.
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
 *   - `followPlaybook` / `unfollowPlaybook` change only the social follow.
 *   - `subscribeFeed` / `unsubscribeFeed` toggle personal push for ONE feed
 *     (a single automation's alert) without touching the playbook follow.
 *   - `subscribeBatch` / `unsubscribeBatch` toggle FEED alerts by target id.
 *
 * Backed by alva-gateway REST under `/api/v1/follows/...` and
 * `/api/v1/subscriptions/...`.
 */
export class SubscriptionsResource {
  constructor(private client: AlvaClient) {}

  /**
   * Follow a playbook `(username, name)`. Alerts are independent and require
   * explicit FEED subscriptions. Idempotent.
   */
  async followPlaybook(
    params: PlaybookFollowParams
  ): Promise<FollowPlaybookResponse> {
    this.client._requireAuth();
    const path = `/api/v1/follows/playbook/${encodeURIComponent(params.username)}/${encodeURIComponent(params.name)}`;
    return this.client._request(
      'POST',
      path
    ) as Promise<FollowPlaybookResponse>;
  }

  /**
   * Unfollow a playbook `(username, name)` without changing FEED alerts.
   */
  async unfollowPlaybook(
    params: PlaybookFollowParams
  ): Promise<UnfollowPlaybookResponse> {
    this.client._requireAuth();
    const path = `/api/v1/follows/playbook/${encodeURIComponent(params.username)}/${encodeURIComponent(params.name)}`;
    return this.client._request(
      'DELETE',
      path
    ) as Promise<UnfollowPlaybookResponse>;
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

  /** Atomically enable alerts for FEED target ids (max 100). */
  async subscribeBatch(
    params: SubscribeBatchParams
  ): Promise<SubscribeBatchResponse> {
    this.client._requireAuth();
    return this.client._request(
      'POST',
      '/api/v1/subscriptions/subscribe-batch',
      {
        body: {
          feed_ids: params.feedIds,
          channel_id: params.channelId,
        },
      }
    ) as Promise<SubscribeBatchResponse>;
  }

  /**
   * Disable alerts for many FEED targets by id in one idempotent call (max
   * 100 ids). The per-id results report `INVALID_ID` for malformed entries.
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
          feed_ids: params.feedIds,
        },
      }
    ) as Promise<UnsubscribeBatchResponse>;
  }
}
