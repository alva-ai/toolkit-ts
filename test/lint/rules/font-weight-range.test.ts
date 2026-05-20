import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../../src/lint/parser.js';
import { buildModel } from '../../../src/lint/model.js';
import { fontWeightRange } from '../../../src/lint/rules/font-weight-range.js';
import type { Contract } from '../../../src/lint/types.js';

const CONTRACT: Contract = {
  version: 1,
  global: {
    requiredContainer: { selector: '.playbook-container', mustExist: true },
    scroll: { soleScrollContainer: ['body'] },
    typography: { fontFamilyRootMustInclude: 'Delight', fontWeightAllowed: [400, 500] },
    links: { anchorRequiredAttrs: ['target', 'rel'] },
  },
  components: [],
};

describe('font-weight-range', () => {
  it('passes for 400/500', () => {
    const m = buildModel(
      parseHtml('<style>h1 { font-weight: 500; } p { font-weight: 400; }</style>'),
      CONTRACT
    );
    expect(fontWeightRange(m, CONTRACT)).toEqual([]);
  });

  it('errors on font-weight: 700 in CSS', () => {
    const m = buildModel(
      parseHtml('<style>h1 { font-weight: 700; }</style>'),
      CONTRACT
    );
    const f = fontWeightRange(m, CONTRACT);
    expect(f).toHaveLength(1);
    expect(f[0]!.selector).toBe('h1');
  });

  it('errors on font-weight: bold in CSS', () => {
    const m = buildModel(
      parseHtml('<style>h1 { font-weight: bold; }</style>'),
      CONTRACT
    );
    expect(fontWeightRange(m, CONTRACT)).toHaveLength(1);
  });

  it('errors on inline style font-weight: 700', () => {
    const m = buildModel(
      parseHtml('<p style="font-weight: 700">x</p>'),
      CONTRACT
    );
    expect(fontWeightRange(m, CONTRACT)).toHaveLength(1);
  });
});
