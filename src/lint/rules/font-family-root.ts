// src/lint/rules/font-family-root.ts
import type {
  Contract,
  Finding,
  ResolvedModel,
  RuleDescriptor,
} from '../types.js';

const ROOT_SELECTORS = new Set([
  'body',
  'html',
  ':root',
  'html, body',
  'body, html',
]);

export function fontFamilyRoot(
  model: ResolvedModel,
  contract: Contract
): Finding[] {
  const required = contract.global.typography.fontFamilyRootMustInclude;
  for (const rule of model.dom.cssRules) {
    const sel = rule.selectorText.trim().toLowerCase();
    if (!ROOT_SELECTORS.has(sel)) continue;
    const ff = rule.declarations['font-family'];
    if (ff && ff.toLowerCase().includes(required.toLowerCase())) {
      return [];
    }
  }
  return [
    {
      rule: 'font-family-root',
      severity: 'error',
      message: `Root font-family must include '${required}' (set on body/html/:root).`,
    },
  ];
}

export const fontFamilyRootRule: RuleDescriptor = {
  name: 'font-family-root',
  severity: 'error',
  run: fontFamilyRoot,
};
