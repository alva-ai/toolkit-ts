import type { Contract, Finding, Report, ResolvedModel } from './types.js';
import { ALL_RULES } from './rules/index.js';

export function runRules(model: ResolvedModel, contract: Contract): Report {
  const findings: Finding[] = [];
  for (const rule of ALL_RULES) {
    for (const f of rule.run(model, contract)) {
      findings.push({ ...f, rule: f.rule || rule.name, severity: f.severity || rule.severity });
    }
  }
  const summary = { errors: 0, warnings: 0, info: 0 };
  for (const f of findings) {
    if (f.severity === 'error') summary.errors++;
    else if (f.severity === 'warning') summary.warnings++;
    else summary.info++;
  }
  return { findings, summary };
}
