// src/lint/rules/font-family-root.ts
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
  // Auto-pass when a canonical CSS bundle is <link>ed — the bundle declares font-family.
  const canonical = contract.global.canonicalCssUrls ?? [];
  if (canonical.length > 0) {
    const linked = new Set<string>();
    for (const el of model.dom.elements) {
      if (el.tag !== 'link') continue;
      const rel = (el.attrs.rel ?? '').toLowerCase();
      if (!rel.split(/\s+/).includes('stylesheet')) continue;
      if (el.attrs.href) linked.add(el.attrs.href);
    }
    if (canonical.some((u) => linked.has(u))) return [];
  }

  const required = contract.global.typography.fontFamilyRootMustInclude;
  if (!required) return [];
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
