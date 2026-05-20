// src/lint/model.ts
import { walkTree } from './parser.js';
import type { Contract, DomModel, ResolvedModel } from './types.js';

/**
 * Build the ResolvedModel: walk the DOM in identical document order to
 * parseHtml() so element-key indices align, and resolve component
 * ownership via stack-based subtree tracking.
 *
 * For each element, ownership is the nearest ancestor (including self)
 * whose `class` list contains a registered component `root`. Elements
 * outside any registered subtree get no ownership entry.
 */
export function buildModel(dom: DomModel, contract: Contract): ResolvedModel {
  const componentRoots = new Map<string, string[]>();
  const componentOwnership = new Map<string, string>();

  // Map root class → component name for fast lookup
  const rootToName = new Map<string, string>();
  for (const comp of contract.components) {
    rootToName.set(comp.root, comp.name);
  }

  let i = 0;
  const ownerStack: string[] = [];

  walkTree(
    dom.rawHtml,
    (el) => {
      const classes = (el.getAttribute('class') ?? '')
        .split(/\s+/)
        .filter(Boolean);
      const matchedRoot = classes.find((c) => rootToName.has(c));
      const elementKey = dom.elements[i]?.elementKey;
      i++;

      if (matchedRoot && elementKey) {
        const name = rootToName.get(matchedRoot)!;
        if (!componentRoots.has(name)) componentRoots.set(name, []);
        componentRoots.get(name)!.push(elementKey);
        componentOwnership.set(elementKey, name);
        ownerStack.push(name);
      } else if (elementKey && ownerStack.length > 0) {
        componentOwnership.set(elementKey, ownerStack[ownerStack.length - 1]!);
      }
    },
    (el) => {
      const classes = (el.getAttribute('class') ?? '')
        .split(/\s+/)
        .filter(Boolean);
      if (classes.some((c) => rootToName.has(c))) {
        ownerStack.pop();
      }
    }
  );

  return { dom, componentRoots, componentOwnership };
}
