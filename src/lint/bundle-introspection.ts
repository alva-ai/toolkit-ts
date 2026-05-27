// src/lint/bundle-introspection.ts
// Shared helpers for rules that auto-pass when a canonical-css-urls bundle
// is <link>ed: instead of trusting the link blindly, we parse the bundle CSS
// (attached to the contract by the orchestrator) and verify the promise.
import * as csstree from 'css-tree';

const ROOT_SELECTOR_RE = /^(body|html|:root|html\s*,\s*body|body\s*,\s*html)$/i;

/**
 * Returns true iff a body|html|:root rule in `bundleCss` declares font-family
 * containing `required` (case-insensitive substring on the value).
 *
 * Used by `font-family-root` to verify the canonical-link auto-pass.
 */
export function bundleDeliversRootFontFamily(
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

interface RequirementMatch {
  /** Original "property: value" string from the contract */
  requirement: string;
  /** Parsed property name (left of first ':') */
  property: string;
  /** Parsed value (right of first ':', trimmed) */
  value: string;
}

function parseRequirements(requirements: string[]): RequirementMatch[] {
  return requirements.map((req) => {
    const [propRaw, ...valParts] = req.split(':');
    return {
      requirement: req,
      property: propRaw!.trim(),
      value: valParts.join(':').trim(),
    };
  });
}

/**
 * Returns the subset of `requirements` (each "property: value") that the
 * bundle does NOT declare anywhere. A requirement is satisfied if ANY rule
 * in the bundle has a declaration matching its property+value (exact value
 * match, whitespace-normalized).
 *
 * Used by `anti-aliasing-declarations` to verify the canonical-link
 * auto-pass. The check intentionally allows any selector — anti-aliasing
 * is presentation that cascades; the design system puts it on body, but
 * the rule's authoring semantic is "this declaration is in the cascade
 * somewhere".
 */
export function bundleMissingDeclarations(
  bundleCss: string,
  requirements: string[]
): string[] {
  const wanted = parseRequirements(requirements);
  let ast: csstree.CssNode;
  try {
    ast = csstree.parse(bundleCss);
  } catch {
    return [...requirements];
  }
  if (ast.type !== 'StyleSheet') return [...requirements];

  const satisfied = new Set<string>();
  csstree.walk(ast, {
    visit: 'Declaration',
    enter(d) {
      if (d.type !== 'Declaration') return;
      for (const w of wanted) {
        if (satisfied.has(w.requirement)) continue;
        if (d.property !== w.property) continue;
        const v = csstree.generate(d.value).trim();
        if (v === w.value) satisfied.add(w.requirement);
      }
    },
  });

  return requirements.filter((r) => !satisfied.has(r));
}
