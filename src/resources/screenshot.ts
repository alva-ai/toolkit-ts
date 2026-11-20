import type { AlvaClient } from '../client.js';
import type { Schema } from '../platformApi.js';

export class ScreenshotResource {
  constructor(private client: AlvaClient) {}

  /**
   * Captures a page: the image as base64 with its type. Paid: a retry with
   * the same `idempotencyKey` is charged once.
   */
  async capture(
    body: Schema<'ScreenshotRequest'>,
    options: { idempotencyKey?: string } = {}
  ): Promise<Schema<'Screenshot'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/screenshots', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }
}
