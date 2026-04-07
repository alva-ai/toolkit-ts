import type { AlvaClient } from '../client.js';
import type { ScreenshotParams } from '../types.js';

export class ScreenshotResource {
  constructor(private client: AlvaClient) {}

  async capture(params: ScreenshotParams): Promise<ArrayBuffer> {
    this.client._requireAuth();
    return this.client._request('GET', '/api/v1/screenshot', {
      query: {
        url: params.url,
        selector: params.selector,
        xpath: params.xpath,
      },
    }) as Promise<ArrayBuffer>;
  }
}
