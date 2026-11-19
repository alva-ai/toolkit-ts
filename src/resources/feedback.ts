import type { AlvaClient } from '../client.js';
import type {
  AlvaId,
  SubmitFeedbackRequest,
  SubmitFeedbackResponse,
} from '../types.js';

export class FeedbackResource {
  constructor(private client: AlvaClient) {}

  async submit(params: SubmitFeedbackRequest): Promise<SubmitFeedbackResponse> {
    this.client._requireAuth();
    const feedback = await this.client._v2Request<{
      id: AlvaId;
      notionPageId: string | null;
      notionUrl: string | null;
    }>('POST', '/feedback', {
      body: {
        source: params.source?.toUpperCase(),
        category: params.category?.toUpperCase(),
        severity: params.severity?.toUpperCase(),
        summary: params.summary,
        details: params.details,
        evidence: params.evidence,
        context: params.context,
      },
    });
    return {
      feedback_id: feedback.id,
      notion_page_id: feedback.notionPageId ?? '',
      notion_url: feedback.notionUrl ?? '',
    };
  }
}
