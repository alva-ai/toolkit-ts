// src/lint/rules/font-family-root.ts
import { bundleDeliversRootFontFamily } from '../bundle-introspection.js';
import type {
  Contract,
  Finding,
  ResolvedModel,
  RuleDescriptor,
} from '../types.js';

const ROOT_SELECTORS = new Set([
  'body',
  'html',
  ':root',
  'html, body',
  'body, html',
]);

export function fontFamilyRoot(
  model: ResolvedModel,
  contract: Contract
): Finding[] {
  const required = contract.global.typography.fontFamilyRootMustInclude;
  if (!required) return [];

  // Canonical-bundle auto-pass: when the playbook <link>s a canonical bundle
  // URL, the bundle is the cascade source for `body { font-family }`. Verify
  // against the resolved bundle CSS rather than blindly trusting the URL.
  const canonical = contract.global.canonicalCssUrls ?? [];
  if (canonical.length > 0) {
    const linked = new Set<string>();
    for (const el of model.dom.elements) {
      if (el.tag !== 'link') continue;
      const rel = (el.attrs.rel ?? '').toLowerCase();
      if (!rel.split(/\s+/).includes('stylesheet')) continue;
      if (el.attrs.href) linked.add(el.attrs.href);
    }
    if (canonical.some((u) => linked.has(u))) {
      if (contract.bundleCss) {
        if (bundleDeliversRootFontFamily(contract.bundleCss, required)) {
          return [];
        }
        return [
          {
            rule: 'font-family-root',
            severity: 'error',
            message:
              `Canonical bundle is linked but it does not declare ` +
              `'${required}' as root font-family. Contract promises ` +
              `'${required}' on body/html/:root via canonical-css-urls — ` +
              `bundle on CDN has drifted from the contract. Re-publish the ` +
              `design system, or set body font-family inline as a stopgap.`,
          },
        ];
      }
      // No bundle CSS resolved (e.g. caller passed contract without bundleCss).
      // Preserve the legacy trust-the-link behavior for backwards compatibility.
      return [];
    }
  }

  for (const rule of model.dom.cssRules) {
    const sel = rule.selectorText.trim().toLowerCase();
    if (!ROOT_SELECTORS.has(sel)) continue;
    const ff = rule.declarations['font-family'];
    if (ff && ff.toLowerCase().includes(required.toLowerCase())) {
      return [];
    }
  }
  return [
    {
      rule: 'font-family-root',
      severity: 'error',
      message: `Root font-family must include '${required}' (set on body/html/:root).`,
    },
  ];
}

export const fontFamilyRootRule: RuleDescriptor = {
  name: 'font-family-root',
  severity: 'error',
  run: fontFamilyRoot,
};
