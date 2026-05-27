// test/lint/fetchContract.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  loadActiveContract,
  loadActiveBundle,
  loadActiveDesignSystem,
} from '../../src/lint/fetchContract.js';

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

describe('loadActiveBundle', () => {
  it('returns CDN bundle when fetch succeeds', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('body { font-family: Delight; }'),
    });
    const css = await loadActiveBundle({
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    expect(css).toContain('font-family');
  });

  it('falls back to bundled css when fetch fails', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('network'));
    const css = await loadActiveBundle({
      fetch: fetch as unknown as typeof globalThis.fetch,
      bundledCss: '/* fallback */',
    });
    expect(css).toBe('/* fallback */');
  });

  it('returns empty string when both fail (does not throw)', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('network'));
    const css = await loadActiveBundle({
      fetch: fetch as unknown as typeof globalThis.fetch,
      bundledCss: '',
    });
    expect(css).toBe('');
  });
});

describe('loadActiveDesignSystem', () => {
  it('returns contract with bundleCss attached', async () => {
    const fetchContract = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(VALID_YAML),
    });
    const fetchBundle = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('body { font-family: Delight; }'),
    });
    const c = await loadActiveDesignSystem(
      { fetch: fetchContract as unknown as typeof globalThis.fetch },
      { fetch: fetchBundle as unknown as typeof globalThis.fetch }
    );
    expect(c.version).toBe(1);
    expect(c.bundleCss).toContain('font-family');
  });
});
