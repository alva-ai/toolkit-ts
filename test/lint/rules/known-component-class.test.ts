import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../../src/lint/parser.js';
import { buildModel } from '../../../src/lint/model.js';
import { knownComponentClass } from '../../../src/lint/rules/known-component-class.js';
import type { Contract } from '../../../src/lint/types.js';

const CONTRACT: Contract = {
  version: 1,
  global: {
    requiredContainer: { selector: '.playbook-container', mustExist: true },
    scroll: { soleScrollContainer: ['body'] },
    typography: {
      fontFamilyRootMustInclude: 'Delight',
      fontWeightAllowed: [400, 500],
    },
    links: { anchorRequiredAttrs: ['target', 'rel'] },
  },
  components: [
    {
      name: 'button',
      root: 'btn',
      variants: ['btn-primary', 'btn-secondary'],
      sizes: ['btn-large'],
      states: ['btn-disabled'],
    },
  ],
};

describe('known-component-class', () => {
  it('passes for registered classes', () => {
    const m = buildModel(
      parseHtml('<button class="btn btn-primary btn-large">X</button>'),
      CONTRACT
    );
    expect(knownComponentClass(m, CONTRACT)).toEqual([]);
  });

  it('errors on unregistered btn-* class', () => {
    const m = buildModel(
      parseHtml('<button class="btn btn-huge">X</button>'),
      CONTRACT
    );
    const f = knownComponentClass(m, CONTRACT);
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toMatch(/btn-huge/);
  });

  it('does not flag root class itself', () => {
    const m = buildModel(parseHtml('<button class="btn">X</button>'), CONTRACT);
    expect(knownComponentClass(m, CONTRACT)).toEqual([]);
  });

  it('does not flag unrelated classes', () => {
    const m = buildModel(
      parseHtml('<div class="my-custom-thing">X</div>'),
      CONTRACT
    );
    expect(knownComponentClass(m, CONTRACT)).toEqual([]);
  });
});
