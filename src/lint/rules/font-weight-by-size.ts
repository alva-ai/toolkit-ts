// src/lint/rules/font-weight-by-size.ts
import type {
  Contract,
  Finding,
  ResolvedModel,
  RuleDescriptor,
} from '../types.js';

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

/** Return font-size in px, or null if not parseable. Supports px and rem/em (16px base). */
function parseFontSizePx(raw: string): number | null {
  const m = /^(-?\d*\.?\d+)(px|rem|em)?$/i.exec(raw.trim());
  if (!m) return null;
  const value = parseFloat(m[1]!);
  const unit = (m[2] ?? 'px').toLowerCase();
  if (unit === 'px') return value;
  if (unit === 'rem' || unit === 'em') return value * 16; // approximate
  return null;
}

// LIMITATION: this rule only catches the common case where both font-size and
// font-weight are declared in the SAME rule (or the same inline style block).
// Cascade-resolved combinations (font-size from one rule, weight from another)
// are out of scope for v1. The schema treats "no restrictions" (undefined or
// empty array) as a no-op; if you want to forbid ALL weights at some size,
// configure font-weight-range instead.
export function fontWeightBySize(
  model: ResolvedModel,
  contract: Contract
): Finding[] {
  const restrictions = contract.global.typography.fontWeightRestrictions ?? [];
  if (restrictions.length === 0) return [];

  const findings: Finding[] = [];

  for (const rule of model.dom.cssRules) {
    const fs = rule.declarations['font-size'];
    const fw = rule.declarations['font-weight'];
    if (!fs || !fw) continue;
    const px = parseFontSizePx(fs);
    const weight = normalizeWeight(fw);
    if (px === null || weight === null) continue;

    for (const r of restrictions) {
      if (px >= r.minFontSizePx && !r.allowed.includes(weight)) {
        findings.push({
          rule: 'font-weight-by-size',
          severity: 'error',
          message: `Selector '${rule.selectorText}' uses font-weight:${weight} at font-size:${fs}; for font-size >= ${r.minFontSizePx}px only ${r.allowed.join('/')} is allowed.`,
          selector: rule.selectorText,
          ...(rule.sourceLine !== undefined
            ? { location: { line: rule.sourceLine, column: 0 } }
            : {}),
        });
        break;
      }
    }
  }

  for (const el of model.dom.elements) {
    const fs = el.declarations['font-size'];
    const fw = el.declarations['font-weight'];
    if (!fs || !fw) continue;
    const px = parseFontSizePx(fs);
    const weight = normalizeWeight(fw);
    if (px === null || weight === null) continue;

    for (const r of restrictions) {
      if (px >= r.minFontSizePx && !r.allowed.includes(weight)) {
        findings.push({
          rule: 'font-weight-by-size',
          severity: 'error',
          message: `Inline style on <${el.tag}> uses font-weight:${weight} at font-size:${fs}; for font-size >= ${r.minFontSizePx}px only ${r.allowed.join('/')} is allowed.`,
          ...(el.line !== undefined
            ? { location: { line: el.line, column: 0 } }
            : {}),
        });
        break;
      }
    }
  }

  return findings;
}

export const fontWeightBySizeRule: RuleDescriptor = {
  name: 'font-weight-by-size',
  severity: 'error',
  run: fontWeightBySize,
};
