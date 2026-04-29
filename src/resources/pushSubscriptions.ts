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
 *   - Following a playbook elsewhere will compound-subscribe automatically.
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
    const path = `/api/v1/playbook/${encodeURIComponent(params.username)}/${encodeURIComponent(params.name)}/push-subscription`;
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
    const path = `/api/v1/playbook/${encodeURIComponent(params.username)}/${encodeURIComponent(params.name)}/push-subscription`;
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
    const path = `/api/v1/feed/${encodeURIComponent(params.username)}/${encodeURIComponent(params.name)}/push-subscription`;
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
    const path = `/api/v1/feed/${encodeURIComponent(params.username)}/${encodeURIComponent(params.name)}/push-subscription`;
    return this.client._request(
      'DELETE',
      path
    ) as Promise<UnsubscribePushTargetResponse>;
  }

  /**
   * List the caller's personal push subscriptions across all targets
   * (playbook + feed). Defaults to currently-active rows only; pass
   * `include_history=true` to also return previously-unsubscribed rows.
   */
  async list(
    params: PushSubscriptionListParams = {}
  ): Promise<PushSubscriptionListResponse> {
    this.client._requireAuth();
    const query: Record<string, string> = {};
    if (params.include_history !== undefined) {
      query.include_history = String(params.include_history);
    }
    return this.client._request('GET', '/api/v1/me/push-subscriptions', {
      query,
    }) as Promise<PushSubscriptionListResponse>;
  }
}
