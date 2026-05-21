// src/lint/rules/single-scroll-container.ts
import type {
  Contract,
  Finding,
  ResolvedModel,
  RuleDescriptor,
} from '../types.js';

const SCROLL_VALUES = new Set(['auto', 'scroll']);

export function singleScrollContainer(
  model: ResolvedModel,
  contract: Contract
): Finding[] {
  const allowed = new Set(contract.global.scroll.soleScrollContainer);
  const findings: Finding[] = [];
  for (const rule of model.dom.cssRules) {
    const ov = rule.declarations['overflow-y'];
    if (!ov) continue;
    const val = ov.split(/\s+/)[0]!.toLowerCase();
    if (!SCROLL_VALUES.has(val)) continue;
    const trimmed = rule.selectorText.trim().toLowerCase();
    if (allowed.has(trimmed)) continue;
    findings.push({
      rule: 'single-scroll-container',
      severity: 'error',
      message: `Selector '${rule.selectorText}' sets overflow-y:${val}; only ${[...allowed].join('/')} may be a page-level scroll container.`,
      selector: rule.selectorText,
      ...(rule.sourceLine !== undefined
        ? { location: { line: rule.sourceLine, column: 0 } }
        : {}),
    });
  }
  return findings;
}

export const singleScrollContainerRule: RuleDescriptor = {
  name: 'single-scroll-container',
  severity: 'error',
  run: singleScrollContainer,
};
