// src/lint/rules/required-stylesheet.ts
import type {
  Contract,
  Finding,
  ResolvedModel,
  RuleDescriptor,
} from '../types.js';

function collectLinkedStylesheets(model: ResolvedModel): Set<string> {
  const set = new Set<string>();
  for (const el of model.dom.elements) {
    if (el.tag !== 'link') continue;
    const rel = (el.attrs.rel ?? '').toLowerCase();
    if (!rel.split(/\s+/).includes('stylesheet')) continue;
    const href = el.attrs.href;
    if (href) set.add(href);
  }
  return set;
}

export function requiredStylesheet(
  model: ResolvedModel,
  contract: Contract
): Finding[] {
  const groups = contract.global.requiredStylesheets ?? [];
  if (groups.length === 0) return [];

  const linked = collectLinkedStylesheets(model);
  const findings: Finding[] = [];

  for (const group of groups) {
    const satisfied = group.urls.some((u) => linked.has(u));
    if (!satisfied) {
      findings.push({
        rule: 'required-stylesheet',
        severity: 'error',
        message: `Playbook must <link rel="stylesheet"> to one of: ${group.urls.map((u) => `'${u}'`).join(' OR ')}.`,
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
