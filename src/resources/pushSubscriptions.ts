import type { AlvaClient } from '../client.js';
import type {
  PushSubscriptionListParams,
  PushSubscriptionListResponse,
  PushSubscriptionPlaybookParams,
  SubscribePushTargetResponse,
  UnsubscribePushTargetResponse,
} from '../types.js';

/**
 * Personal push subscriptions — opt the caller in or out of personal
 * DM/web push for a target. Independent of social follow:
 *
 *   - `subscribePlaybook` does not start following.
 *   - `unsubscribePlaybook` does not unfollow.
 *   - Following a playbook elsewhere will compound-subscribe automatically.
 *
 * Backed by alva-gateway REST (mirrors the GraphQL surface in
 * `pkg/schema/push_subscription.graphql`).
 */
export class PushSubscriptionsResource {
  constructor(private client: AlvaClient) {}

  /**
   * Opt into personal push for one playbook `(username, name)`.
   * Idempotent. Auth: callers must be able to read the playbook
   * (public/paid pass; private requires explicit alfs grant).
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
   * List the caller's personal push subscriptions across all targets.
   * Defaults to currently-active rows only; pass `include_history=true`
   * to also return previously-unsubscribed rows.
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
