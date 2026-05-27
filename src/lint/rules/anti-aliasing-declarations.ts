// src/lint/rules/anti-aliasing-declarations.ts
import { bundleMissingDeclarations } from '../bundle-introspection.js';
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

  // Canonical-bundle auto-pass: when the playbook <link>s a canonical bundle
  // URL, the bundle is the cascade source for anti-aliasing. Verify against
  // the resolved bundle CSS rather than blindly trusting the URL.
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
        const missing = bundleMissingDeclarations(
          contract.bundleCss,
          aa.requiredDeclarations
        );
        if (missing.length === 0) return [];
        return missing.map((req) => ({
          rule: 'anti-aliasing-declarations',
          severity: 'error' as const,
          message:
            `Canonical bundle is linked but does not declare '${req}' anywhere. ` +
            `Contract requires it via anti-aliasing.required-declarations — ` +
            `bundle on CDN has drifted from the contract. Re-publish the design ` +
            `system, or declare it inline as a stopgap.`,
        }));
      }
      // No bundle CSS resolved (e.g. caller passed contract without bundleCss).
      // Preserve the legacy trust-the-link behavior for backwards compatibility.
      return [];
    }
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
