import { afterEach, describe, it, expect } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { aScreenshot, REQUEST_ID } from '../accountV2.js';
import { fakeV2 } from '../fakeV2.js';

let restore: (() => void) | undefined;
afterEach(() => restore?.());

describe('ScreenshotResource', () => {
  it('capture() posts the ScreenshotRequest with a key and returns the Screenshot', async () => {
    const fake = fakeV2({ 'POST /screenshots': () => aScreenshot('iVBORw==') });
    restore = fake.restore;
    const client = new AlvaClient({
      apiKey: 'key',
      baseUrl: 'https://api.test',
    });
    const body = {
      url: '/playbook/alice/btc-dashboard',
      compress: true,
      compressQuality: 70,
    };
    expect(
      await client.screenshot.capture(body, { idempotencyKey: REQUEST_ID })
    ).toEqual(aScreenshot('iVBORw=='));
    expect(fake.calls[0].body).toEqual(body);
    expect(fake.calls[0].headers['Idempotency-Key']).toBe(`"${REQUEST_ID}"`);
  });
});
