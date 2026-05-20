// src/lint/rules/required-container.ts
import type {
  Contract,
  Finding,
  ResolvedModel,
  RuleDescriptor,
} from '../types.js';

export function requiredContainer(
  model: ResolvedModel,
  contract: Contract
): Finding[] {
  const sel = contract.global.requiredContainer.selector;
  if (!sel.startsWith('.')) return []; // only class selectors supported v1
  const className = sel.slice(1);
  const found = model.dom.elements.some((e) => e.classes.includes(className));
  if (!found && contract.global.requiredContainer.mustExist) {
    return [
      {
        rule: 'required-container',
        severity: 'error',
        message: `Required container '${sel}' is missing from the playbook.`,
      },
    ];
  }
  return [];
}

export const requiredContainerRule: RuleDescriptor = {
  name: 'required-container',
  severity: 'error',
  run: requiredContainer,
};
