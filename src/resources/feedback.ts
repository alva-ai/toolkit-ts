import type { AlvaClient } from '../client.js';
import type { Schema } from '../platformApi.js';

export class FeedbackResource {
  constructor(private client: AlvaClient) {}

  /** Files product feedback. */
  async submit(
    body: Schema<'SubmitFeedbackRequest'>,
    options: { idempotencyKey?: string } = {}
  ): Promise<Schema<'Feedback'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/feedback', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }
}
