// src/lint/rules/element-component-binding.ts
import { parse as parseHtmlTree, HTMLElement } from 'node-html-parser';
import type {
  Contract,
  Finding,
  ResolvedModel,
  RuleDescriptor,
} from '../types.js';

export function elementComponentBinding(
  model: ResolvedModel,
  contract: Contract
): Finding[] {
  const findings: Finding[] = [];
  const rootClasses = new Set(contract.components.map((c) => c.root));

  const root = parseHtmlTree(model.dom.rawHtml, {
    lowerCaseTagName: true,
    comment: false,
    blockTextElements: { style: true, script: true },
  });

  for (const comp of contract.components) {
    for (const binding of comp.bindings ?? []) {
      const matches = root.querySelectorAll(binding.selector);
      for (const el of matches) {
        const classes = (el.getAttribute('class') ?? '')
          .split(/\s+/)
          .filter(Boolean);
        if (classes.includes(binding.requireClass)) continue;
        let exempt = false;
        let cur: HTMLElement | null = el.parentNode as HTMLElement | null;
        while (cur && cur.tagName) {
          const cc = (cur.getAttribute('class') ?? '')
            .split(/\s+/)
            .filter(Boolean);
          if (cc.some((c) => rootClasses.has(c))) {
            exempt = true;
            break;
          }
          cur = cur.parentNode as HTMLElement | null;
        }
        if (exempt) continue;
        findings.push({
          rule: 'element-component-binding',
          severity: 'error',
          message: `<${el.tagName.toLowerCase()}> matched by '${binding.selector}' must carry class '${binding.requireClass}' (unless nested inside a registered component root).`,
          selector: binding.selector,
        });
      }
    }
  }
  return findings;
}

export const elementComponentBindingRule: RuleDescriptor = {
  name: 'element-component-binding',
  severity: 'error',
  run: elementComponentBinding,
};
