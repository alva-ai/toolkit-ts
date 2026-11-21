import { describe, it, expect } from 'vitest';
import { decodeBase64, encodeBase64 } from '../src/base64.js';

describe('base64', () => {
  it('round-trips every padding length', () => {
    for (const bytes of [
      [],
      [0xff],
      [0xff, 0x00],
      [0xfb, 0xff, 0xbf],
      [1, 2, 3, 4],
    ]) {
      const encoded = encodeBase64(new Uint8Array(bytes));
      expect(encoded).toBe(Buffer.from(bytes).toString('base64'));
      expect([...new Uint8Array(decodeBase64(encoded))]).toEqual(bytes);
    }
  });

  it('refuses unpadded or foreign characters', () => {
    for (const bad of ['QQ', 'QQ=', 'Q===', 'QQ-_', 'QQ==QQ==']) {
      expect(() => decodeBase64(bad)).toThrow('invalid base64');
    }
  });
});
