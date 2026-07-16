import type { AlvaClient } from '../client.js';
import type {
  AutomationInspectRequest,
  AutomationInspectResponse,
  AutomationUpdateRequest,
  AutomationUpdateResponse,
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

  /** Partially update one existing automation by immutable decimal-string id. */
  async update(
    params: AutomationUpdateRequest
  ): Promise<AutomationUpdateResponse> {
    this.client._requireAuth();
    const id = requireAutomationIDString(params.id);
    if (!hasAutomationUpdate(params)) {
      throw new Error(
        'automation update requires at least one field or trigger=true'
      );
    }
    return this.client._request(
      'PATCH',
      `/api/v1/automation/${encodeURIComponent(String(id))}`,
      {
        body: {
          version: params.version,
          cronjob_id: params.cronjob_id,
          description: params.description,
          changelog: params.changelog,
          agent_type: params.agent_type,
          trigger: params.trigger,
        },
      }
    ) as Promise<AutomationUpdateResponse>;
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

function requireAutomationIDString(id: string): string {
  if (!/^[1-9]\d*$/.test(id)) {
    throw new Error('automation id must be a positive integer string');
  }
  return id;
}

function hasAutomationUpdate(params: AutomationUpdateRequest): boolean {
  return (
    params.version !== undefined ||
    params.cronjob_id !== undefined ||
    params.description !== undefined ||
    params.changelog !== undefined ||
    params.agent_type !== undefined ||
    params.trigger === true
  );
}
