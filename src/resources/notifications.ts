import type { AlvaClient } from '../client.js';
import type {
  FeedNotificationListResponse,
  NotificationListParams,
  PlaybookNotificationListResponse,
} from '../types.js';

export class NotificationsResource {
  constructor(private client: AlvaClient) {}

  /**
   * List the caller's notification history for one playbook
   * `(username, name)`. Returns `NOT_FOUND` when the playbook is
   * private or does not exist (the two cases are deliberately
   * indistinguishable to prevent namespace enumeration).
   */
  async listPlaybook(
    params: NotificationListParams
  ): Promise<PlaybookNotificationListResponse> {
    this.client._requireAuth();
    const path = `/api/v1/playbook/${encodeURIComponent(params.username)}/${encodeURIComponent(params.name)}/notifications`;
    return this.client._request('GET', path, {
      query: buildQuery(params),
    }) as Promise<PlaybookNotificationListResponse>;
  }

  /**
   * List the caller's notification history for one feed
   * `(username, name)`. Authorization is alfs read on
   * `/alva/home/<username>/feeds/<name>`.
   */
  async listFeed(
    params: NotificationListParams
  ): Promise<FeedNotificationListResponse> {
    this.client._requireAuth();
    const path = `/api/v1/feed/${encodeURIComponent(params.username)}/${encodeURIComponent(params.name)}/notifications`;
    return this.client._request('GET', path, {
      query: buildQuery(params),
    }) as Promise<FeedNotificationListResponse>;
  }
}

function buildQuery(params: NotificationListParams): Record<string, string> {
  const q: Record<string, string> = {};
  if (params.channel) q.channel = params.channel;
  if (params.status) q.status = params.status;
  if (params.since_time !== undefined && params.since_time > 0) {
    q.since_time = String(params.since_time);
  }
  if (params.first !== undefined && params.first > 0) {
    q.first = String(params.first);
  }
  if (params.cursor) q.cursor = params.cursor;
  return q;
}
