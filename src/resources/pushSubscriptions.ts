import type { AlvaClient } from '../client.js';
import type {
  PushSubscriptionFeedParams,
  PushSubscriptionListParams,
  PushSubscriptionListResponse,
  PushSubscriptionPlaybookParams,
  SubscribeFeedPushTargetResponse,
  SubscribePushTargetResponse,
  UnsubscribePushTargetResponse,
} from '../types.js';

/**
 * Personal push subscriptions — opt the caller in or out of personal
 * DM/web push for a target. Independent of social follow:
 *
 *   - `subscribePlaybook` / `subscribeFeed` do not start following.
 *   - `unsubscribePlaybook` / `unsubscribeFeed` do not unfollow.
 *   - Following a playbook elsewhere does not create or revive a push
 *     subscription.
 *
 * Backed by alva-gateway REST (mirrors the GraphQL surface in
 * `pkg/schema/push_subscription.graphql`).
 */
export class PushSubscriptionsResource {
  constructor(private client: AlvaClient) {}

  /**
   * Opt into personal push for one playbook `(username, name)`.
   * Fires for any feed of that playbook. Idempotent. Auth: callers must
   * be able to read the playbook (public/paid pass; private requires
   * explicit alfs grant).
   */
  async subscribePlaybook(
    params: PushSubscriptionPlaybookParams
  ): Promise<SubscribePushTargetResponse> {
    this.client._requireAuth();
    const path = `/api/v1/push-subscriptions/playbook/${encodeURIComponent(params.username)}/${encodeURIComponent(params.name)}`;
    return this.client._request(
      'POST',
      path
    ) as Promise<SubscribePushTargetResponse>;
  }

  /**
   * Soft-disable personal push for one playbook `(username, name)`.
   * Does NOT remove any social follow. Idempotent.
   */
  async unsubscribePlaybook(
    params: PushSubscriptionPlaybookParams
  ): Promise<UnsubscribePushTargetResponse> {
    this.client._requireAuth();
    const path = `/api/v1/push-subscriptions/playbook/${encodeURIComponent(params.username)}/${encodeURIComponent(params.name)}`;
    return this.client._request(
      'DELETE',
      path
    ) as Promise<UnsubscribePushTargetResponse>;
  }

  /**
   * Opt into personal push for one feed `(username, name)`. Fires for
   * that specific feed regardless of which playbook(s) consume it; if
   * the feed is shared across playbooks the subscriber receives one
   * push per playbook context. Idempotent.
   */
  async subscribeFeed(
    params: PushSubscriptionFeedParams
  ): Promise<SubscribeFeedPushTargetResponse> {
    this.client._requireAuth();
    const path = `/api/v1/push-subscriptions/feed/${encodeURIComponent(params.username)}/${encodeURIComponent(params.name)}`;
    return this.client._request(
      'POST',
      path
    ) as Promise<SubscribeFeedPushTargetResponse>;
  }

  /**
   * Soft-disable personal push for one feed `(username, name)`.
   * Idempotent.
   */
  async unsubscribeFeed(
    params: PushSubscriptionFeedParams
  ): Promise<UnsubscribePushTargetResponse> {
    this.client._requireAuth();
    const path = `/api/v1/push-subscriptions/feed/${encodeURIComponent(params.username)}/${encodeURIComponent(params.name)}`;
    return this.client._request(
      'DELETE',
      path
    ) as Promise<UnsubscribePushTargetResponse>;
  }

  /**
   * List the caller's currently active personal push subscriptions.
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
    return this.client._request('GET', '/api/v1/me/push-subscriptions', {
      query,
    }) as Promise<PushSubscriptionListResponse>;
  }
}
