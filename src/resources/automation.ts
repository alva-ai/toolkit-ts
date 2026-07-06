import type { AlvaClient } from '../client.js';
import type {
  AutomationInspectRequest,
  AutomationInspectResponse,
  FeedDeleteRequest,
  FeedDeleteResponse,
  FeedListParams,
  FeedListResponse,
  FeedReleaseRequest,
  FeedReleaseResponse,
  FeedStatusUpdateRequest,
  FeedStatusUpdateResponse,
} from '../types.js';

/**
 * Product-facing automation API. Backed by the existing feed/release gateway
 * surfaces while those lower-level names remain on the wire for compatibility.
 */
export class AutomationResource {
  constructor(private client: AlvaClient) {}

  list(params: FeedListParams = {}): Promise<FeedListResponse> {
    return this.client.feed.list(params);
  }

  /**
   * Inspect one automation. Backed by GET /api/v1/automation/:id.
   */
  async inspect(
    params: AutomationInspectRequest
  ): Promise<AutomationInspectResponse> {
    this.client._requireAuth();
    const id = requireAutomationID(params.id);
    return this.client._request(
      'GET',
      `/api/v1/automation/${encodeURIComponent(String(id))}`
    ) as Promise<AutomationInspectResponse>;
  }

  stop(params: FeedStatusUpdateRequest): Promise<FeedStatusUpdateResponse> {
    return this.client.feed.stop(params);
  }

  resume(params: FeedStatusUpdateRequest): Promise<FeedStatusUpdateResponse> {
    return this.client.feed.resume(params);
  }

  delete(params: FeedDeleteRequest): Promise<FeedDeleteResponse> {
    return this.client.feed.delete(params);
  }

  publish(params: FeedReleaseRequest): Promise<FeedReleaseResponse> {
    return this.client.release.feed(params);
  }
}

function requireAutomationID(id: number): number {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('automation id must be a positive integer');
  }
  return id;
}
