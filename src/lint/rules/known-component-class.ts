// src/lint/rules/known-component-class.ts
import type {
  Contract,
  Finding,
  ResolvedModel,
  RuleDescriptor,
  ComponentSpec,
} from '../types.js';

function classesFor(c: ComponentSpec): string[] {
  return [
    c.root,
    ...(c.variants ?? []),
    ...(c.sizes ?? []),
    ...(c.states ?? []),
    ...(c.children ?? []),
    ...(c.bindings ?? []).map((b) => b.requireClass),
  ];
}

function prefixOf(cls: string): string {
  const i = cls.indexOf('-');
  return i < 0 ? cls : cls.slice(0, i);
}

export function knownComponentClass(
  model: ResolvedModel,
  contract: Contract
): Finding[] {
  // Build the global set of registered classes and a prefix → component-name
  // map. A prefix may belong to multiple components if they share a namespace;
  // we record the first one for the message.
  const allRegistered = new Set<string>();
  const prefixOwner = new Map<string, ComponentSpec>();
  for (const comp of contract.components) {
    for (const cls of classesFor(comp)) {
      allRegistered.add(cls);
      const p = prefixOf(cls);
      if (!prefixOwner.has(p)) prefixOwner.set(p, comp);
    }
  }

  const findings: Finding[] = [];
  for (const el of model.dom.elements) {
    for (const cls of el.classes) {
      const p = prefixOf(cls);
      const owner = prefixOwner.get(p);
      if (!owner) continue; // unknown prefix → not flagged
      if (allRegistered.has(cls)) continue; // class itself is registered
      const ownerRegistered = new Set(classesFor(owner));
      findings.push({
        rule: 'known-component-class',
        severity: 'error',
        message: `Class '${cls}' looks like a '${owner.name}' modifier but is not registered. Valid classes in this family: ${[...ownerRegistered].sort().join(', ')}.`,
        selector: `<${el.tag}>`,
        ...(el.line !== undefined
          ? { location: { line: el.line, column: 0 } }
          : {}),
      });
    }
  }
  return findings;
}

export const knownComponentClassRule: RuleDescriptor = {
  name: 'known-component-class',
  severity: 'error',
  run: knownComponentClass,
};
