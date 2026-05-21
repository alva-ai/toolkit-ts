// src/lint/rules/component-required-structure.ts
import type {
  Contract,
  Finding,
  ResolvedModel,
  RuleDescriptor,
} from '../types.js';

export function componentRequiredStructure(
  model: ResolvedModel,
  contract: Contract
): Finding[] {
  const findings: Finding[] = [];
  for (const comp of contract.components) {
    const hasVariants = (comp.variants?.length ?? 0) > 0;
    const hasSizes = (comp.sizes?.length ?? 0) > 0;
    if (!hasVariants && !hasSizes) continue;

    const variantSet = new Set(comp.variants ?? []);
    const sizeSet = new Set(comp.sizes ?? []);

    for (const el of model.dom.elements) {
      if (!el.classes.includes(comp.root)) continue;

      const elLocation =
        el.line !== undefined ? { location: { line: el.line, column: 0 } } : {};
      if (hasVariants && !el.classes.some((c) => variantSet.has(c))) {
        findings.push({
          rule: 'component-required-structure',
          severity: 'error',
          message: `<${el.tag} class="${comp.root} …"> missing required '${comp.name}' variant (one of: ${[...variantSet].join(', ')}).`,
          ...elLocation,
        });
      }
      if (hasSizes && !el.classes.some((c) => sizeSet.has(c))) {
        findings.push({
          rule: 'component-required-structure',
          severity: 'error',
          message: `<${el.tag} class="${comp.root} …"> missing required '${comp.name}' size (one of: ${[...sizeSet].join(', ')}).`,
          ...elLocation,
        });
      }
    }
  }
  return findings;
}

export const componentRequiredStructureRule: RuleDescriptor = {
  name: 'component-required-structure',
  severity: 'error',
  run: componentRequiredStructure,
};
