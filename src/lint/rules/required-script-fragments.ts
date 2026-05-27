// src/lint/rules/required-script-fragments.ts
import type {
  Contract,
  Finding,
  ResolvedModel,
  RuleDescriptor,
  ScriptRequirement,
} from '../types.js';

export function requiredScriptFragments(
  model: ResolvedModel,
  contract: Contract
): Finding[] {
  const presentNames = new Set(model.componentRoots.keys());
  const allScriptText = model.dom.scripts.join('\n');
  const findings: Finding[] = [];

  const processRequirement = (
    req: ScriptRequirement,
    scopeLabel: string
  ): void => {
    // co-presence gate (class-based)
    if (req.whenAlso && !req.whenAlso.every((c) => presentNames.has(c))) return;
    // semantic-script gate (substring-based; bypasses naming)
    if (
      req.whenScriptContains &&
      !req.whenScriptContains.every((s) => allScriptText.includes(s))
    ) {
      return;
    }
    for (const sub of req.mustContain) {
      if (allScriptText.includes(sub)) continue;
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
        message: `${scopeLabel}${ctx} requires <script> to contain '${sub}'.${hint}`,
      });
    }
  };

  // Component-scoped requirements: gate on the component being present.
  for (const comp of contract.components) {
    if (!presentNames.has(comp.name)) continue;
    for (const req of comp.requiredScripts ?? []) {
      processRequirement(req, `'${comp.name}'`);
    }
  }

  // Global requirements: not scoped to any component. Cross-cutting rules
  // like "any page using ECharts needs requestAnimationFrame" live here.
  for (const req of contract.global.requiredScripts ?? []) {
    processRequirement(req, 'playbook');
  }

  return findings;
}

export const requiredScriptFragmentsRule: RuleDescriptor = {
  name: 'required-script-fragments',
  severity: 'error',
  run: requiredScriptFragments,
};
