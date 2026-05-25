import type {
  Contract,
  Finding,
  ResolvedModel,
  RuleDescriptor,
  ComponentSpec,
} from '../types.js';

function classesFor(c: ComponentSpec): string[] {
  return [
    c.root,
    ...(c.variants ?? []),
    ...(c.sizes ?? []),
    ...(c.states ?? []),
    ...(c.children ?? []),
    ...(c.bindings ?? []).map((b) => b.requireClass),
  ];
}

function isCanonicalLinked(model: ResolvedModel, canonical: string[]): boolean {
  if (canonical.length === 0) return false;
  for (const el of model.dom.elements) {
    if (el.tag !== 'link') continue;
    const rel = (el.attrs.rel ?? '').toLowerCase();
    if (!rel.split(/\s+/).includes('stylesheet')) continue;
    if (el.attrs.href && canonical.includes(el.attrs.href)) return true;
  }
  return false;
}

/** Extract class names from a CSS selector string.
 *  e.g. ".btn.btn-primary > .icon" → ["btn", "btn-primary", "icon"]. */
function classesInSelector(selectorText: string): string[] {
  const out: string[] = [];
  // Matches ".class-name" — class names per CSS spec.
  const re = /\.([A-Za-z_][\w-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(selectorText))) {
    out.push(m[1]!);
  }
  return out;
}

export function forbidCoreSelectorOverride(
  model: ResolvedModel,
  contract: Contract
): Finding[] {
  const canonical = contract.global.canonicalCssUrls ?? [];
  if (!isCanonicalLinked(model, canonical)) return [];

  const canonicalClasses = new Set<string>();
  for (const comp of contract.components) {
    for (const c of classesFor(comp)) canonicalClasses.add(c);
  }

  const findings: Finding[] = [];
  const reported = new Set<string>();
  for (const rule of model.dom.cssRules) {
    const classes = classesInSelector(rule.selectorText);
    for (const cls of classes) {
      if (!canonicalClasses.has(cls)) continue;
      const key = `${rule.selectorText}::${cls}`;
      if (reported.has(key)) continue;
      reported.add(key);
      findings.push({
        rule: 'forbid-core-selector-override',
        severity: 'warning',
        message:
          `Selector '${rule.selectorText}' overrides canonical class '.${cls}' from v1/design-system.css. ` +
          'Delete the inline rule, or confirm this is a case-by-case design decision.',
        selector: rule.selectorText,
        ...(rule.sourceLine !== undefined
          ? { location: { line: rule.sourceLine, column: 0 } }
          : {}),
      });
    }
  }
  return findings;
}

export const forbidCoreSelectorOverrideRule: RuleDescriptor = {
  name: 'forbid-core-selector-override',
  severity: 'warning',
  run: forbidCoreSelectorOverride,
};
