// src/lint/rules/anti-aliasing-declarations.ts
import type {
  Contract,
  Finding,
  ResolvedModel,
  RuleDescriptor,
} from '../types.js';

export function antiAliasingDeclarations(
  model: ResolvedModel,
  contract: Contract
): Finding[] {
  const aa = contract.global.antiAliasing;
  if (!aa || aa.requiredDeclarations.length === 0) return [];

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

  const findings: Finding[] = [];
  for (const requirement of aa.requiredDeclarations) {
    // Each requirement is "<property>: <value>" — split on the first ':' so
    // values that themselves contain ':' (rare for AA, but cheap to support)
    // are preserved.
    const [propRaw, ...valParts] = requirement.split(':');
    const prop = propRaw!.trim();
    const wantedValue = valParts.join(':').trim();

    let satisfied = false;
    for (const rule of model.dom.cssRules) {
      const actual = rule.declarations[prop];
      if (actual && actual.trim() === wantedValue) {
        satisfied = true;
        break;
      }
    }
    if (!satisfied) {
      findings.push({
        rule: 'anti-aliasing-declarations',
        severity: 'error',
        message: `Required CSS declaration '${requirement}' is missing from all <style> rules.`,
      });
    }
  }
  return findings;
}

export const antiAliasingDeclarationsRule: RuleDescriptor = {
  name: 'anti-aliasing-declarations',
  severity: 'error',
  run: antiAliasingDeclarations,
};
