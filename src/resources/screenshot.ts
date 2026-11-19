import type { AlvaClient } from '../client.js';
import { decodeBase64 } from '../base64.js';
import type { ScreenshotParams } from '../types.js';

export class ScreenshotResource {
  constructor(private client: AlvaClient) {}

  /** The image bytes; their type is sniffed by the caller. */
  async capture(params: ScreenshotParams): Promise<ArrayBuffer> {
    this.client._requireAuth();
    const shot = await this.client._v2Request<{
      contentType: string;
      contentBase64: string;
    }>('POST', '/screenshots', {
      body: {
        url: params.url,
        selector: params.selector,
        xpath: params.xpath,
        compress: params.compress,
        compressQuality: params.compressQuality,
        compressMaxWidth: params.compressMaxWidth,
      },
    });
    return decodeBase64(shot.contentBase64);
  }
}
