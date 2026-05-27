import { loadContract } from './contract.js';
import { FALLBACK_CONTRACT_YAML } from './fallback-contract.js';
import { FALLBACK_BUNDLE_CSS } from './fallback-bundle.js';
import type { Contract } from './types.js';

export const CONTRACT_CDN_URL =
  'https://alva-ai-static.b-cdn.net/design-system/design-contract.yaml';
export const BUNDLE_CDN_URL =
  'https://alva-ai-static.b-cdn.net/design-system/v1/design-system.css';

export interface LoadOptions {
  fetch?: typeof globalThis.fetch;
  bundledYaml?: string;
  url?: string;
}

export interface LoadBundleOptions {
  fetch?: typeof globalThis.fetch;
  bundledCss?: string;
  url?: string;
}

export async function loadActiveContract(
  opts: LoadOptions = {}
): Promise<Contract> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const url = opts.url ?? CONTRACT_CDN_URL;
  const bundled = opts.bundledYaml ?? FALLBACK_CONTRACT_YAML;

  try {
    const resp = await doFetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const yaml = await resp.text();
    return loadContract(yaml);
  } catch (cdnErr) {
    if (bundled) {
      try {
        return loadContract(bundled);
      } catch (bundledErr) {
        throw new Error(
          `design-contract unavailable: CDN failed (${(cdnErr as Error).message}) and bundled fallback failed (${(bundledErr as Error).message}).`
        );
      }
    }
    throw new Error(
      `design-contract unavailable: CDN failed (${(cdnErr as Error).message}) and no bundled fallback.`
    );
  }
}

/**
 * Fetch the canonical v1 design-system.css bundle from the CDN, falling back
 * to the build-time vendored copy. Returns an empty string if both are
 * unavailable — callers should treat empty as "no bundle available" rather
 * than throw.
 */
export async function loadActiveBundle(
  opts: LoadBundleOptions = {}
): Promise<string> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const url = opts.url ?? BUNDLE_CDN_URL;
  const bundled = opts.bundledCss ?? FALLBACK_BUNDLE_CSS;

  try {
    const resp = await doFetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } catch {
    return bundled ?? '';
  }
}

/**
 * Load contract + bundle together. Callers should prefer this so the rule
 * pipeline always has bundle CSS available for canonical-link auto-pass
 * verification.
 */
export async function loadActiveDesignSystem(
  contractOpts: LoadOptions = {},
  bundleOpts: LoadBundleOptions = {}
): Promise<Contract> {
  const [contract, bundleCss] = await Promise.all([
    loadActiveContract(contractOpts),
    loadActiveBundle(bundleOpts),
  ]);
  return { ...contract, bundleCss };
}
