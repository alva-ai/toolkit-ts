import type { AlvaClient } from '../client.js';
import type { FeedDeleteRequest, FeedDeleteResponse } from '../types.js';

export interface FeedListItem {
  id: string;
  name: string;
  status: string;
  cron_expression?: string;
  total_runs: number;
  used_by_total: number;
}

export interface ListFeedResponse {
  feeds: FeedListItem[];
  next_cursor?: string;
  has_more: boolean;
}

export type FeedListStatus = 'active' | 'paused' | 'all';

/**
 * Feed lifecycle management. Backed by alva-gateway REST (mirrors the
 * GraphQL surface in `pkg/schema/feed.graphql`).
 */
export class FeedResource {
  constructor(private client: AlvaClient) {}

  /**
   * List feeds owned by the authenticated user. Backed by gateway
   * `GET /api/v1/feed`, which calls `ListFeedsByUID`.
   */
  async list(params?: {
    cursor?: string;
    limit?: number;
    status?: FeedListStatus;
  }): Promise<ListFeedResponse> {
    this.client._requireAuth();
    const query: Record<string, unknown> = {};
    if (params?.cursor) query.cursor = params.cursor;
    if (params?.limit !== undefined) query.limit = params.limit;
    if (params?.status) query.status = params.status;
    return this.client._request('GET', '/api/v1/feed', {
      query,
    }) as Promise<ListFeedResponse>;
  }

  /**
   * Soft-delete a feed and all its active majors. Cascades:
   *   - all active feed_majors are soft-deleted in the same transaction
   *   - associated producer cronjobs are removed best-effort (the cronjob
   *     scavenger reconciles any leftover rows on its next sweep)
   *
   * Auth: caller must own the feed (uid match), enforced by the backend.
   */
  async delete(params: FeedDeleteRequest): Promise<FeedDeleteResponse> {
    this.client._requireAuth();
    if (!Number.isInteger(params.id) || params.id <= 0) {
      throw new Error('feed id must be a positive integer');
    }
    return this.client._request(
      'DELETE',
      `/api/v1/feed/${encodeURIComponent(String(params.id))}`
    ) as Promise<FeedDeleteResponse>;
  }
}
