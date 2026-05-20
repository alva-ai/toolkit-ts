import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../../src/lint/parser.js';
import { buildModel } from '../../../src/lint/model.js';
import { componentRequiredStructure } from '../../../src/lint/rules/component-required-structure.js';
import type { Contract } from '../../../src/lint/types.js';

const CONTRACT: Contract = {
  version: 1,
  global: {
    requiredContainer: { selector: '.playbook-container', mustExist: true },
    scroll: { soleScrollContainer: ['body'] },
    typography: { fontFamilyRootMustInclude: 'Delight', fontWeightAllowed: [400, 500] },
    links: { anchorRequiredAttrs: ['target', 'rel'] },
  },
  components: [
    {
      name: 'button',
      root: 'btn',
      variants: ['btn-primary', 'btn-secondary'],
      sizes: ['btn-large', 'btn-medium'],
    },
    { name: 'tag', root: 'tag' },
  ],
};

describe('component-required-structure', () => {
  it('passes when btn has a variant and a size', () => {
    const m = buildModel(
      parseHtml('<button class="btn btn-primary btn-large">X</button>'),
      CONTRACT
    );
    expect(componentRequiredStructure(m, CONTRACT)).toEqual([]);
  });

  it('errors when btn missing variant', () => {
    const m = buildModel(
      parseHtml('<button class="btn btn-large">X</button>'),
      CONTRACT
    );
    const f = componentRequiredStructure(m, CONTRACT);
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toMatch(/variant/);
  });

  it('errors when btn missing size', () => {
    const m = buildModel(
      parseHtml('<button class="btn btn-primary">X</button>'),
      CONTRACT
    );
    const f = componentRequiredStructure(m, CONTRACT);
    expect(f.some((x) => /size/.test(x.message))).toBe(true);
  });

  it('does not require modifiers for components without them defined', () => {
    const m = buildModel(parseHtml('<span class="tag">x</span>'), CONTRACT);
    expect(componentRequiredStructure(m, CONTRACT)).toEqual([]);
  });
});
