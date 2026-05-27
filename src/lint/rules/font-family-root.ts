// src/lint/rules/font-family-root.ts
import * as csstree from 'css-tree';
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

const ROOT_SELECTOR_RE = /^(body|html|:root|html\s*,\s*body|body\s*,\s*html)$/i;

/**
 * Walk parsed bundle CSS and confirm a body/html/:root rule declares
 * font-family containing the required family (case-insensitive).
 * Mirrors `bundleDeliversRootFontFamily` in
 * skills/alva/scripts/design-contract-sync.ts.
 */
function bundleDeliversRootFontFamily(
  bundleCss: string,
  required: string
): boolean {
  let ast: csstree.CssNode;
  try {
    ast = csstree.parse(bundleCss);
  } catch {
    return false;
  }
  if (ast.type !== 'StyleSheet') return false;

  let found = false;
  csstree.walk(ast, {
    visit: 'Rule',
    enter(node) {
      if (found) return;
      if (node.type !== 'Rule') return;
      const sel = csstree.generate(node.prelude).trim();
      if (!ROOT_SELECTOR_RE.test(sel)) return;
      csstree.walk(node.block, {
        visit: 'Declaration',
        enter(d) {
          if (found) return;
          if (d.type !== 'Declaration') return;
          if (d.property !== 'font-family') return;
          const val = csstree.generate(d.value).toLowerCase();
          if (val.includes(required.toLowerCase())) found = true;
        },
      });
    },
  });
  return found;
}

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
