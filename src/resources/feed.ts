import type { AlvaClient } from '../client.js';
import type {
  FeedDeleteRequest,
  FeedDeleteResponse,
  FeedListParams,
  FeedListResponse,
  FeedSetVisibilityRequest,
  FeedSetVisibilityResponse,
  FeedStatusUpdateRequest,
  FeedStatusUpdateResponse,
} from '../types.js';

/**
 * Feed lifecycle management. Backed by alva-gateway REST (mirrors the
 * GraphQL surface in `pkg/schema/feed.graphql`).
 */
export class FeedResource {
  constructor(private client: AlvaClient) {}

  /**
   * List feeds owned by the caller. Backed by GET /api/v1/feed.
   */
  async list(params: FeedListParams = {}): Promise<FeedListResponse> {
    this.client._requireAuth();
    return this.client._request('GET', '/api/v1/feed', {
      query: {
        limit: params.limit,
        cursor: params.cursor,
        status: params.status,
      },
    }) as Promise<FeedListResponse>;
  }

  /**
   * Stop a feed's producer cronjob. This pauses future scheduled runs while
   * preserving the feed and its existing data.
   *
   * Auth: caller must own the feed (uid match), enforced by the backend.
   */
  async stop(
    params: FeedStatusUpdateRequest
  ): Promise<FeedStatusUpdateResponse> {
    this.client._requireAuth();
    const id = requireFeedID(params.id);
    return this.client._request(
      'POST',
      `/api/v1/feed/${encodeURIComponent(String(id))}/stop`
    ) as Promise<FeedStatusUpdateResponse>;
  }

  /**
   * Resume a stopped feed's producer cronjob.
   *
   * Auth: caller must own the feed (uid match), enforced by the backend.
   */
  async resume(
    params: FeedStatusUpdateRequest
  ): Promise<FeedStatusUpdateResponse> {
    this.client._requireAuth();
    const id = requireFeedID(params.id);
    return this.client._request(
      'POST',
      `/api/v1/feed/${encodeURIComponent(String(id))}/resume`
    ) as Promise<FeedStatusUpdateResponse>;
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
    const id = requireFeedID(params.id);
    return this.client._request(
      'DELETE',
      `/api/v1/feed/${encodeURIComponent(String(id))}`
    ) as Promise<FeedDeleteResponse>;
  }

  /**
   * Publish or unpublish a feed. Backed by POST /api/v1/feed/:id/visibility.
   *
   * Setting visibility to 'public' publishes the feed (the backend sets
   * feeds.is_public and projects the ALFS public read grant in the same
   * transaction); 'private' unpublishes it. Prefer this over granting the
   * ALFS public read subject directly (e.g. `alva fs grant`), which bypasses
   * the is_public flag and causes drift.
   *
   * Auth: caller must own the feed (uid match), enforced by the backend.
   */
  async setVisibility(
    params: FeedSetVisibilityRequest
  ): Promise<FeedSetVisibilityResponse> {
    this.client._requireAuth();
    const id = requireFeedID(params.id);
    if (params.visibility !== 'public' && params.visibility !== 'private') {
      throw new Error("visibility must be 'public' or 'private'");
    }
    return this.client._request(
      'POST',
      `/api/v1/feed/${encodeURIComponent(String(id))}/visibility`,
      { body: { visibility: params.visibility } }
    ) as Promise<FeedSetVisibilityResponse>;
  }
}

function requireFeedID(id: number): number {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('feed id must be a positive integer');
  }
  return id;
}
