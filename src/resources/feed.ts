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
  FeedTypedocRequest,
  FeedTypedocResponse,
  FeedWriteRecord,
  FeedWriteRequest,
  FeedWriteResponse,
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

  /**
   * Append Feed SDK-style flat records to a feed output time series.
   *
   * This is a convenience wrapper over ALFS synth writes. Callers pass records
   * shaped like `ctx.self.ts(...).append(records)`, and the resource converts
   * them into synth write points before writing `<path>/@append`.
   */
  async write(params: FeedWriteRequest): Promise<FeedWriteResponse> {
    const path = normalizeFeedOutputPath(params.path, '@append');
    const records = requireFeedWriteRecords(params.records);
    const response = await this.client.fs.write({
      path,
      data: JSON.stringify(
        records.map((record) => ({
          date: record.date,
          value: record,
        }))
      ),
    });
    return { ...response, path, records_written: records.length };
  }

  /**
   * Write the typedoc schema for a feed output time series.
   */
  async typedoc(params: FeedTypedocRequest): Promise<FeedTypedocResponse> {
    const path = normalizeFeedOutputPath(params.path, '@typedoc');
    const typedoc = requireFeedTypedoc(params.typedoc);
    const response = await this.client.fs.write({
      path,
      data: JSON.stringify(typedoc),
    });
    return { ...response, path };
  }
}

function requireFeedID(id: number): number {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('feed id must be a positive integer');
  }
  return id;
}

function normalizeFeedOutputPath(path: string, suffix: '@append' | '@typedoc') {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new Error('feed output path must be a non-empty string');
  }
  const trimmed = path.trim().replace(/\/+$/, '');
  if (trimmed.endsWith(`/${suffix}`)) return trimmed;
  if (containsVirtualSuffix(trimmed)) {
    throw new Error(
      `feed output path must be an output root or end with /${suffix}`
    );
  }
  return `${trimmed}/${suffix}`;
}

function containsVirtualSuffix(path: string): boolean {
  const parts = path.split('/');
  return parts.slice(1).some((part) => part.startsWith('@'));
}

function requireFeedWriteRecords(
  records: FeedWriteRecord[]
): FeedWriteRecord[] {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('feed write records must be a non-empty array');
  }
  return records.map((record, index) => {
    if (!isRecord(record)) {
      throw new Error(`feed write record at index ${index} must be an object`);
    }
    if (!Number.isFinite(record.date)) {
      throw new Error(
        `feed write record at index ${index} must include numeric date`
      );
    }
    return record as FeedWriteRecord;
  });
}

function requireFeedTypedoc(typedoc: Record<string, unknown>) {
  if (!isRecord(typedoc)) {
    throw new Error('feed typedoc must be a JSON object');
  }
  if (typeof typedoc.name !== 'string' || typedoc.name.trim() === '') {
    throw new Error('feed typedoc.name must be a non-empty string');
  }
  if (
    typeof typedoc.description !== 'string' ||
    typedoc.description.trim() === ''
  ) {
    throw new Error('feed typedoc.description must be a non-empty string');
  }
  if (!Array.isArray(typedoc.fields)) {
    throw new Error('feed typedoc.fields must be an array');
  }
  return typedoc;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
