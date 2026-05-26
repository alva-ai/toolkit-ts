// src/lint/rules/required-script-fragments.ts
import type {
  Contract,
  Finding,
  ResolvedModel,
  RuleDescriptor,
} from '../types.js';

export function requiredScriptFragments(
  model: ResolvedModel,
  contract: Contract
): Finding[] {
  const presentNames = new Set(model.componentRoots.keys());
  if (presentNames.size === 0) return [];

  const allScriptText = model.dom.scripts.join('\n');
  const findings: Finding[] = [];

  for (const comp of contract.components) {
    if (!presentNames.has(comp.name)) continue;
    for (const req of comp.requiredScripts ?? []) {
      // co-presence gate (class-based)
      if (req.whenAlso && !req.whenAlso.every((c) => presentNames.has(c))) {
        continue;
      }
      // semantic-script gate (substring-based; bypasses naming)
      if (
        req.whenScriptContains &&
        !req.whenScriptContains.every((s) => allScriptText.includes(s))
      ) {
        continue;
      }
      // substring checks
      for (const sub of req.mustContain) {
        if (!allScriptText.includes(sub)) {
          const ctxParts: string[] = [];
          if (req.whenAlso?.length) {
            ctxParts.push(`also using: ${req.whenAlso.join(' + ')}`);
          }
          if (req.whenScriptContains?.length) {
            ctxParts.push(
              `script contains: ${req.whenScriptContains.map((s) => `'${s}'`).join(' + ')}`
            );
          }
          const ctx = ctxParts.length ? ` (when ${ctxParts.join('; ')})` : '';
          const hint = req.message ? ` — ${req.message}` : '';
          findings.push({
            rule: 'required-script-fragments',
            severity: 'error',
            message: `'${comp.name}'${ctx} requires <script> to contain '${sub}'.${hint}`,
          });
        }
      }
    }
  }
  return findings;
}

export const requiredScriptFragmentsRule: RuleDescriptor = {
  name: 'required-script-fragments',
  severity: 'error',
  run: requiredScriptFragments,
};
