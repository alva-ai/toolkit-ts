// src/lint/rules/known-component-class.ts
//
// Catches "modifier invention" on registered components: a class that
// starts with `<root>-` but isn't in the component's registered class set.
// e.g. `<button class="btn btn-huge">` → 'btn-huge' is flagged because
// `btn-` is the button component's root prefix but `btn-huge` is not in
// {btn-primary, btn-secondary, btn-large, ...}.
//
// Intentionally NOT prefix-aware across components: only the component's
// literal root acts as the prefix. This means widget families with a
// non-bare-prefix root (e.g. chart-card with root `chart-container`)
// won't catch ad-hoc invention like `chart-foo` — accepted to keep
// precision high and avoid false positives on single-class families
// (e.g. `alva-watermark` flagging `alva-checkbox-label`).
import type {
  Contract,
  Finding,
  ResolvedModel,
  RuleDescriptor,
  ComponentSpec,
} from '../types.js';

function registeredSet(c: ComponentSpec): Set<string> {
  const s = new Set<string>([c.root]);
  for (const list of [c.variants, c.sizes, c.states, c.children]) {
    for (const cls of list ?? []) s.add(cls);
  }
  for (const b of c.bindings ?? []) s.add(b.requireClass);
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
            message: `Class '${cls}' looks like a '${comp.name}' modifier but is not registered. Valid: ${[...set].sort().join(', ')}.`,
            selector: `<${el.tag}>`,
            ...(el.line !== undefined
              ? { location: { line: el.line, column: 0 } }
              : {}),
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
