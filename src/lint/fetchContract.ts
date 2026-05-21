import { loadContract } from './contract.js';
import { FALLBACK_CONTRACT_YAML } from './fallback-contract.js';
import type { Contract } from './types.js';

export const CONTRACT_CDN_URL =
  'https://alva-ai-static.b-cdn.net/design-system/design-contract.yaml';

export interface LoadOptions {
  fetch?: typeof globalThis.fetch;
  bundledYaml?: string;
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
