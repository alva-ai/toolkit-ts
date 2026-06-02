import type { AlvaClient } from '../client.js';
import type {
  SubmitFeedbackRequest,
  SubmitFeedbackResponse,
} from '../types.js';

export class FeedbackResource {
  constructor(private client: AlvaClient) {}

  async submit(params: SubmitFeedbackRequest): Promise<SubmitFeedbackResponse> {
    this.client._requireAuth();
    return this.client._request('POST', '/api/v1/feedback', {
      body: params,
    }) as Promise<SubmitFeedbackResponse>;
  }
}
