import type { AlvaClient } from '../client.js';
import { v2Path, type Page } from '../platformApi.js';
import type {
  AlvaId,
  FeedDeleteRequest,
  FeedDeleteResponse,
  FeedListParams,
  FeedListResponse,
  FeedSetVisibilityRequest,
  FeedSetVisibilityResponse,
  FeedStatusUpdateRequest,
  FeedStatusUpdateResponse,
} from '../types.js';

/** An automation in the caller's list, as /api/v2 returns it. */
interface WireAutomationSummary {
  id: AlvaId;
  name: string;
  status: string;
  schedule: { cron: string };
  totalRuns: number;
  usedByCount: number;
}

/**
 * Feed lifecycle management, on the /api/v2 automation routes (a feed is an
 * automation).
 */
export class FeedResource {
  constructor(private client: AlvaClient) {}

  /**
   * List feeds owned by the caller (GET /api/v2/me/automations). `status`
   * defaults to active; `all` lists active and paused feeds.
   */
  async list(params: FeedListParams = {}): Promise<FeedListResponse> {
    this.client._requireAuth();
    const status = params.status ?? 'active';
    const page = await this.client._v2Request<Page<WireAutomationSummary>>(
      'GET',
      '/me/automations',
      {
        query: {
          pageSize: params.limit,
          pageToken: params.cursor || undefined,
          status: status === 'all' ? undefined : status.toUpperCase(),
        },
      }
    );
    return {
      feeds: page.items.map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        ...(a.schedule.cron ? { cron_expression: a.schedule.cron } : {}),
        total_runs: a.totalRuns,
        used_by_total: a.usedByCount,
      })),
      ...(page.nextPageToken === null
        ? {}
        : { next_cursor: page.nextPageToken }),
      has_more: page.nextPageToken !== null,
    };
  }

  /**
   * Stop a feed's producer cronjob. This pauses future scheduled runs while
   * preserving the feed and its existing data.
   *
   * Auth: caller must own the feed, enforced by the backend.
   */
  async stop(
    params: FeedStatusUpdateRequest
  ): Promise<FeedStatusUpdateResponse> {
    return this.setActive(params.id, 'pause');
  }

  /**
   * Resume a stopped feed's producer cronjob.
   *
   * Auth: caller must own the feed, enforced by the backend.
   */
  async resume(
    params: FeedStatusUpdateRequest
  ): Promise<FeedStatusUpdateResponse> {
    return this.setActive(params.id, 'resume');
  }

  /**
   * Soft-delete a feed and all its active majors. Cascades:
   *   - all active feed_majors are soft-deleted in the same transaction
   *   - associated producer cronjobs are removed best-effort (the cronjob
   *     scavenger reconciles any leftover rows on its next sweep)
   *
   * Auth: caller must own the feed, enforced by the backend.
   */
  async delete(params: FeedDeleteRequest): Promise<FeedDeleteResponse> {
    this.client._requireAuth();
    const id = requireFeedID(params.id);
    await this.client._v2Request('DELETE', v2Path`/automations/${id}`);
    return { id };
  }

  /**
   * Publish or unpublish a feed: 'public' publishes it (the backend sets the
   * feed public and projects the ALFS public read grant in the same
   * transaction); 'private' unpublishes it. Prefer this over granting the
   * ALFS public read subject directly (e.g. `alva fs grant`), which bypasses
   * the flag and causes drift.
   *
   * Auth: caller must own the feed, enforced by the backend.
   */
  async setVisibility(
    params: FeedSetVisibilityRequest
  ): Promise<FeedSetVisibilityResponse> {
    this.client._requireAuth();
    const id = requireFeedID(params.id);
    if (params.visibility !== 'public' && params.visibility !== 'private') {
      throw new Error("visibility must be 'public' or 'private'");
    }
    const result = await this.client._v2Request<{
      id: AlvaId;
      visibility: string;
    }>(
      'POST',
      params.visibility === 'public'
        ? v2Path`/automations/${id}/publish`
        : v2Path`/automations/${id}/unpublish`
    );
    return {
      id: result.id,
      visibility:
        result.visibility.toLowerCase() as FeedSetVisibilityResponse['visibility'],
    };
  }

  private async setActive(
    rawID: AlvaId,
    verb: 'pause' | 'resume'
  ): Promise<FeedStatusUpdateResponse> {
    this.client._requireAuth();
    const id = requireFeedID(rawID);
    const automation = await this.client._v2Request<{
      id: AlvaId;
      status: string;
    }>(
      'POST',
      verb === 'pause'
        ? v2Path`/automations/${id}/pause`
        : v2Path`/automations/${id}/resume`
    );
    return { id: automation.id, status: automation.status };
  }
}

function requireFeedID(id: unknown): AlvaId {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('feed id must be a non-empty ID');
  }
  return id;
}
