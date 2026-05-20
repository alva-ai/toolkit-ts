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
  const relMustContain = contract.global.links.relMustContain ?? [];
  const findings: Finding[] = [];
  for (const el of model.dom.elements) {
    if (el.tag !== 'a') continue;
    if (el.attrs.href === undefined) continue;

    const elLocation =
      el.line !== undefined ? { location: { line: el.line, column: 0 } } : {};

    // Pass 1: missing required attributes.
    let relMissing = false;
    for (const attr of required) {
      if (el.attrs[attr] === undefined || el.attrs[attr] === '') {
        findings.push({
          rule: 'anchor-attrs',
          severity: 'error',
          message: `<a href="${el.attrs.href}"> is missing required attribute '${attr}'.`,
          ...elLocation,
        });
        if (attr === 'rel') relMissing = true;
      }
    }

    // Pass 2: rel-must-contain — only enforced when rel exists.
    // Avoid double-reporting when rel is entirely missing (Pass 1 already
    // covered that case).
    if (!relMissing && relMustContain.length > 0) {
      const rel = el.attrs.rel;
      if (rel !== undefined && rel !== '') {
        const tokens = new Set(rel.toLowerCase().split(/\s+/).filter(Boolean));
        const missing = relMustContain.filter(
          (t) => !tokens.has(t.toLowerCase())
        );
        if (missing.length > 0) {
          findings.push({
            rule: 'anchor-attrs',
            severity: 'error',
            message: `<a href="${el.attrs.href}"> rel="${rel}" must contain ${missing.map((m) => `'${m}'`).join(', ')}.`,
            ...elLocation,
          });
        }
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
