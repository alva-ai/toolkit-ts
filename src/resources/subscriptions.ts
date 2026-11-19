import type { AlvaClient } from '../client.js';
import { collectAll, v2Path, type Page } from '../platformApi.js';
import type {
  AlvaId,
  FollowsListParams,
  FollowsListResponse,
  FollowPlaybookResponse,
  PlaybookFollowParams,
  PushSubscriptionFeedParams,
  PushSubscriptionListParams,
  PushSubscription,
  PushSubscriptionListResponse,
  SubscribeFeedParams,
  SubscribeBatchParams,
  SubscribeBatchResponse,
  SubscribeFeedResponse,
  UnsubscribeBatchParams,
  UnsubscribeBatchResponse,
  UnsubscribeResponse,
  UnfollowPlaybookResponse,
} from '../types.js';

/** A NotificationSubscription of /api/v2/me/notification-subscriptions. */
interface WireSubscription {
  id: AlvaId;
  automationId: AlvaId;
  automationName: string | null;
  automationStatus: string;
  targetStatus: string;
  channelId: AlvaId | null;
  usedBy: {
    playbookId: AlvaId;
    ownerUsername: string;
    slug: string;
    displayName: string;
    ownerAvatarUrl: string | null;
  }[];
  usedByCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  lastDeliveredAt: string | null;
}

/** POST and DELETE /api/v2/me/followed-playbooks. */
interface WirePlaybookFollow {
  changed: boolean;
  followedAt: string | null;
  playbook: {
    id: AlvaId;
    ownerUsername: string;
    slug: string;
    displayName: string;
  };
}

/** v1's channel ID of the Agent channel, which /api/v2 writes as no channel. */
const AGENT_CHANNEL = '0';

const millis = (at: string | null) => (at ? Date.parse(at) : 0);

function subscription(s: WireSubscription): PushSubscription {
  return {
    id: s.id,
    target: { type: 'FEED', id: s.automationId },
    created_at_ms: millis(s.createdAt),
    updated_at_ms: millis(s.updatedAt),
    channel_id: s.channelId ?? AGENT_CHANNEL,
    ...(s.automationName ? { feed_name: s.automationName } : {}),
    feed_status: s.automationStatus,
    ...(s.lastDeliveredAt
      ? { last_pushed_at_ms: Date.parse(s.lastDeliveredAt) }
      : {}),
    used_by: s.usedBy.map((u) => ({
      playbook_id: u.playbookId,
      owner_username: u.ownerUsername,
      playbook_name: u.slug,
      display_name: u.displayName,
      owner_avatar_url: u.ownerAvatarUrl ?? '',
    })),
    used_by_total: s.usedByCount,
    kind: 'FEED_ALERT',
    target_status: s.targetStatus,
  };
}

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
 * Backed by /api/v2 (`/me/followed-playbooks`, `/me/notification-subscriptions`)
 * except `subscribeFeed` and `unsubscribeFeed`, which name a feed by owner and
 * name: /api/v2 has no Automation lookup by name yet, so they keep
 * `/api/v1/subscriptions/feed/...`.
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
    const follow = await this.client._v2Request<WirePlaybookFollow>(
      'POST',
      '/me/followed-playbooks',
      { body: { playbookId: await this.playbookID(params) } }
    );
    const { playbook } = follow;
    return {
      follow: {
        playbook_id: playbook.id,
        created_at_ms: millis(follow.followedAt),
        updated_at_ms: millis(follow.followedAt),
      },
      playbook_path: `/alva/home/${playbook.ownerUsername}/playbooks/${playbook.slug}`,
      playbook_id: playbook.id,
    };
  }

  /**
   * Unfollow a playbook `(username, name)` without changing FEED alerts.
   */
  async unfollowPlaybook(
    params: PlaybookFollowParams
  ): Promise<UnfollowPlaybookResponse> {
    this.client._requireAuth();
    const id = await this.playbookID(params);
    const follow = await this.client._v2Request<WirePlaybookFollow>(
      'DELETE',
      v2Path`/me/followed-playbooks/${id}`
    );
    return { ok: true, unfollowed: follow.changed };
  }

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

  /**
   * List the caller's currently active subscriptions.
   * Results are cursor-paginated.
   */
  async list(
    params: PushSubscriptionListParams = {}
  ): Promise<PushSubscriptionListResponse> {
    this.client._requireAuth();
    const page = await this.client._v2Request<Page<WireSubscription>>(
      'GET',
      '/me/notification-subscriptions',
      { query: { pageSize: params.first, pageToken: params.cursor } }
    );
    return {
      items: page.items.map(subscription),
      next_cursor: page.nextPageToken ?? '',
    };
  }

  /**
   * List the playbooks the caller FOLLOWS (the social relation — the UI's
   * "Subscribed Playbooks"). Rows carry the playbook identity; follows of
   * deleted playbooks are filtered server-side. Cursor-paginated.
   */
  async follows(params: FollowsListParams = {}): Promise<FollowsListResponse> {
    this.client._requireAuth();
    const page = await this.client._v2Request<
      Page<{
        id: AlvaId;
        ownerUsername: string;
        slug: string;
        displayName: string;
        followedAt: string | null;
      }>
    >('GET', '/me/followed-playbooks', {
      query: { pageSize: params.limit, pageToken: params.cursor },
    });
    return {
      items: page.items.map((f) => ({
        playbook_id: f.id,
        owner_username: f.ownerUsername,
        name: f.slug,
        display_name: f.displayName,
        followed_at_ms: millis(f.followedAt),
      })),
      has_next: Boolean(page.nextPageToken),
      ...(page.nextPageToken ? { next_cursor: page.nextPageToken } : {}),
    };
  }

  /** Atomically enable alerts for FEED target ids (max 100). */
  async subscribeBatch(
    params: SubscribeBatchParams
  ): Promise<SubscribeBatchResponse> {
    this.client._requireAuth();
    const result = await this.client._v2Request<{
      subscriptions: WireSubscription[];
    }>('POST', '/me/notification-subscriptions', {
      body: {
        automationIds: params.feedIds,
        channelId:
          params.channelId === AGENT_CHANNEL ? undefined : params.channelId,
      },
    });
    return { subscriptions: result.subscriptions.map(subscription) };
  }

  /**
   * Disable alerts for many FEED targets by id (max 100 ids), on every
   * channel. Idempotent: an id with no subscription reports UNSUBSCRIBED.
   */
  async unsubscribeBatch(
    params: UnsubscribeBatchParams
  ): Promise<UnsubscribeBatchResponse> {
    this.client._requireAuth();
    const wanted = new Set(params.feedIds);
    const subscriptions = await collectAll(
      this.client._v2Pages<WireSubscription>('/me/notification-subscriptions', {
        pageSize: 200,
      })
    );
    for (const s of subscriptions) {
      if (!wanted.has(s.automationId)) continue;
      await this.client._v2Request(
        'DELETE',
        v2Path`/me/notification-subscriptions/${s.id}`
      );
    }
    return {
      results: params.feedIds.map((id) => ({
        id,
        kind: 'FEED',
        ok: true,
        status: 'UNSUBSCRIBED',
      })),
      ok_count: params.feedIds.length,
    };
  }

  /** The Playbook ID of `(username, name)`. */
  private async playbookID(params: PlaybookFollowParams): Promise<AlvaId> {
    const playbook = await this.client._v2Request<{ id: AlvaId }>(
      'GET',
      v2Path`/playbooks/by-slug/${params.username}/${params.name}`
    );
    return playbook.id;
  }
}
