import { describe, it, expect } from 'vitest';
import { encodeBase64 } from '../../src/base64.js';
import { v2Client } from '../helpers/v2Client.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

describe('ScreenshotResource', () => {
  it('capture() posts the options and returns the decoded image bytes', async () => {
    const { client, v2 } = v2Client({
      'POST /screenshots': {
        contentType: 'image/png',
        contentBase64: encodeBase64(PNG),
      },
    });
    const image = await client.screenshot.capture({
      url: '/playbook/alice/btc-dashboard',
      compress: true,
      compressQuality: 70,
      compressMaxWidth: 1280,
    });
    expect(new Uint8Array(image)).toEqual(PNG);
    expect(v2).toHaveBeenCalledWith('POST', '/screenshots', {
      body: {
        url: '/playbook/alice/btc-dashboard',
        selector: undefined,
        xpath: undefined,
        compress: true,
        compressQuality: 70,
        compressMaxWidth: 1280,
      },
    });
  });

  it('capture() refuses content that is not base64', async () => {
    const { client } = v2Client({
      'POST /screenshots': { contentType: 'image/png', contentBase64: 'a*b=' },
    });
    await expect(
      client.screenshot.capture({ url: '/x' })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
