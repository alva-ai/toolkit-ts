import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// legacy/browser-0.36.global.js is what npm published as
// @alva-ai/toolkit@0.36.0 dist/browser.global.js (npm pack, registry shasum
// 47694598eed9bab4200ccf72331054a3fbfadcd2); the build copies it to
// dist/browser.global.js unchanged.
const PUBLISHED_SHA256 =
  'bf0ca91562798b97ffa61b549e97585c8b6b16bffedc6c7b66b690eb5b0ab493';

describe('the frozen browser bundle', () => {
  it('is the published 0.36.0 bundle', () => {
    const bytes = fs.readFileSync(
      new URL('../legacy/browser-0.36.global.js', import.meta.url)
    );
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      PUBLISHED_SHA256
    );
    expect(bytes.toString('utf8')).toContain('var AlvaToolkit=');
  });
});
