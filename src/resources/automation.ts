import type { AlvaClient } from '../client.js';
import type {
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
