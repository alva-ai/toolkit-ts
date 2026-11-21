import { AlvaError } from './error.js';

// Standard base64 (RFC 4648 section 4) without atob/btoa or Buffer, so it runs
// in every runtime the SDK and the embedded CLI load in.

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function encodeBase64(bytes: Uint8Array): string {
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    encoded += ALPHABET[first >> 2];
    encoded += ALPHABET[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    encoded +=
      second === undefined
        ? '='
        : ALPHABET[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    encoded += third === undefined ? '=' : ALPHABET[third & 0x3f];
  }
  return encoded;
}

/** Decodes padded base64; anything else is an INVALID_RESPONSE from the server. */
export function decodeBase64(text: string): ArrayBuffer {
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
    throw new AlvaError(
      'INVALID_RESPONSE',
      'the server returned invalid base64 content',
      502
    );
  }
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((text.length / 4) * 3 - padding);
  let out = 0;
  for (let index = 0; index < text.length; index += 4) {
    const chunk =
      (ALPHABET.indexOf(text[index]!) << 18) |
      (ALPHABET.indexOf(text[index + 1]!) << 12) |
      (Math.max(ALPHABET.indexOf(text[index + 2]!), 0) << 6) |
      Math.max(ALPHABET.indexOf(text[index + 3]!), 0);
    for (const shift of [16, 8, 0]) {
      if (out < bytes.length) bytes[out++] = (chunk >> shift) & 0xff;
    }
  }
  return bytes.buffer;
}
