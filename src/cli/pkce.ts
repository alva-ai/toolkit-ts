import * as crypto from 'node:crypto';

/**
 * Generate a PKCE code verifier per RFC 7636 §4.1.
 * 32 random bytes encoded as base64url with no padding (43 chars).
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Derive the PKCE code challenge from a verifier per RFC 7636 §4.2 (S256).
 * base64url(SHA256(verifier)) with no padding (43 chars).
 */
export function deriveChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}
