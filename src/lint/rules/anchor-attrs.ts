// src/lint/rules/anchor-attrs.ts
import type {
  Contract,
  Finding,
  ResolvedModel,
  RuleDescriptor,
} from '../types.js';

export function anchorAttrs(
  model: ResolvedModel,
  contract: Contract
): Finding[] {
  const required = contract.global.links.anchorRequiredAttrs;
  const findings: Finding[] = [];
  for (const el of model.dom.elements) {
    if (el.tag !== 'a') continue;
    if (el.attrs.href === undefined) continue;
    for (const attr of required) {
      if (el.attrs[attr] === undefined || el.attrs[attr] === '') {
        findings.push({
          rule: 'anchor-attrs',
          severity: 'error',
          message: `<a href="${el.attrs.href}"> is missing required attribute '${attr}'.`,
        });
      }
    }
  }
  return findings;
}

export const anchorAttrsRule: RuleDescriptor = {
  name: 'anchor-attrs',
  severity: 'error',
  run: anchorAttrs,
};
