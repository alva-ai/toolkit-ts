// src/lint/rules/required-stylesheet.ts
import type {
  Contract,
  Finding,
  ResolvedModel,
  RuleDescriptor,
} from '../types.js';

export function requiredStylesheet(
  model: ResolvedModel,
  contract: Contract
): Finding[] {
  const required = contract.global.requiredStylesheets ?? [];
  if (required.length === 0) return [];

  const linkedHrefs = new Set<string>();
  for (const el of model.dom.elements) {
    if (el.tag !== 'link') continue;
    const rel = (el.attrs.rel ?? '').toLowerCase();
    if (!rel.split(/\s+/).includes('stylesheet')) continue;
    const href = el.attrs.href;
    if (href) linkedHrefs.add(href);
  }

  const findings: Finding[] = [];
  for (const { url } of required) {
    if (!linkedHrefs.has(url)) {
      findings.push({
        rule: 'required-stylesheet',
        severity: 'error',
        message: `Required stylesheet '${url}' is not linked from the playbook (need <link rel="stylesheet" href="...">).`,
      });
    }
  }
  return findings;
}

export const requiredStylesheetRule: RuleDescriptor = {
  name: 'required-stylesheet',
  severity: 'error',
  run: requiredStylesheet,
};
