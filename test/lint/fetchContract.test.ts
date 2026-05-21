// test/lint/fetchContract.test.ts
import { describe, it, expect, vi } from 'vitest';
import { loadActiveContract } from '../../src/lint/fetchContract.js';

const VALID_YAML = `
version: 1
global:
  required-container: { selector: ".playbook-container", must-exist: true }
  scroll: { sole-scroll-container: ["body"] }
  typography: { font-family-root-must-include: "Delight", font-weight-allowed: [400, 500] }
  links: { anchor-required-attrs: ["target", "rel"] }
components: {}
`;

describe('loadActiveContract', () => {
  it('returns CDN contract when fetch succeeds', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(VALID_YAML),
    });
    const c = await loadActiveContract({
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    expect(c.version).toBe(1);
  });

  it('falls back to bundled when fetch fails', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('network'));
    const c = await loadActiveContract({
      fetch: fetch as unknown as typeof globalThis.fetch,
      bundledYaml: VALID_YAML,
    });
    expect(c.version).toBe(1);
  });

  it('throws when both fail', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('network'));
    await expect(
      loadActiveContract({
        fetch: fetch as unknown as typeof globalThis.fetch,
        bundledYaml: '',
      })
    ).rejects.toThrow();
  });
});
