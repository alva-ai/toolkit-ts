// src/lint/rules/font-weight-range.ts
import type { Contract, Finding, ResolvedModel, RuleDescriptor } from '../types.js';

const WEIGHT_KEYWORDS: Record<string, number> = {
  normal: 400,
  bold: 700,
  lighter: 300,
  bolder: 700,
};

function normalizeWeight(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed in WEIGHT_KEYWORDS) return WEIGHT_KEYWORDS[trimmed]!;
  const n = parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

export function fontWeightRange(
  model: ResolvedModel,
  contract: Contract
): Finding[] {
  const allowed = new Set(contract.global.typography.fontWeightAllowed);
  const findings: Finding[] = [];

  for (const rule of model.dom.cssRules) {
    const fw = rule.declarations['font-weight'];
    if (!fw) continue;
    const n = normalizeWeight(fw);
    if (n === null) continue;
    if (!allowed.has(n)) {
      findings.push({
        rule: 'font-weight-range',
        severity: 'error',
        message: `Selector '${rule.selectorText}' uses font-weight:${fw}; only ${[...allowed].join('/')} allowed.`,
        selector: rule.selectorText,
      });
    }
  }

  for (const el of model.dom.elements) {
    const fw = el.declarations['font-weight'];
    if (!fw) continue;
    const n = normalizeWeight(fw);
    if (n === null) continue;
    if (!allowed.has(n)) {
      findings.push({
        rule: 'font-weight-range',
        severity: 'error',
        message: `Inline style on <${el.tag}> uses font-weight:${fw}; only ${[...allowed].join('/')} allowed.`,
      });
    }
  }
  return findings;
}

export const fontWeightRangeRule: RuleDescriptor = {
  name: 'font-weight-range',
  severity: 'error',
  run: fontWeightRange,
};
