import { describe, it, expect } from 'vitest';
import { generateCodeVerifier, deriveChallenge } from '../../src/cli/pkce.js';

describe('generateCodeVerifier', () => {
  it('produces a 43-character base64url string with no padding', () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toHaveLength(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('produces a different value on each call', () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });
});

describe('deriveChallenge', () => {
  it('matches the RFC 7636 Appendix B reference vector', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = deriveChallenge(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('returns a 43-character base64url string with no padding', () => {
    const challenge = deriveChallenge(generateCodeVerifier());
    expect(challenge).toHaveLength(43);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
