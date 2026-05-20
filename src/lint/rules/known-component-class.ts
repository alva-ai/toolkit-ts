// src/lint/rules/known-component-class.ts
import type { Contract, Finding, ResolvedModel, RuleDescriptor, ComponentSpec } from '../types.js';

function registeredSet(c: ComponentSpec): Set<string> {
  const s = new Set<string>([c.root]);
  for (const list of [c.variants, c.sizes, c.states, c.children]) {
    for (const cls of list ?? []) s.add(cls);
  }
  return s;
}

export function knownComponentClass(
  model: ResolvedModel,
  contract: Contract
): Finding[] {
  const findings: Finding[] = [];
  const registeredByComp = contract.components.map((c) => ({
    comp: c,
    set: registeredSet(c),
  }));

  for (const el of model.dom.elements) {
    for (const cls of el.classes) {
      for (const { comp, set } of registeredByComp) {
        if (cls === comp.root) continue;
        if (cls.startsWith(comp.root + '-') && !set.has(cls)) {
          findings.push({
            rule: 'known-component-class',
            severity: 'error',
            message: `Class '${cls}' looks like a '${comp.name}' modifier but is not registered. Valid: ${[...set].join(', ')}.`,
            selector: `<${el.tag}>`,
          });
        }
      }
    }
  }
  return findings;
}

export const knownComponentClassRule: RuleDescriptor = {
  name: 'known-component-class',
  severity: 'error',
  run: knownComponentClass,
};
