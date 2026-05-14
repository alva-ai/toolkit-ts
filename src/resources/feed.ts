import type { AlvaClient } from '../client.js';
import type { FeedDeleteRequest, FeedDeleteResponse } from '../types.js';

/**
 * Feed lifecycle management. Backed by alva-gateway REST (mirrors the
 * GraphQL surface in `pkg/schema/feed.graphql`).
 */
export class FeedResource {
  constructor(private client: AlvaClient) {}

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
