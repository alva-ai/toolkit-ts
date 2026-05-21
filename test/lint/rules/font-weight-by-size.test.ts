import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../../src/lint/parser.js';
import { buildModel } from '../../../src/lint/model.js';
import { fontWeightBySize } from '../../../src/lint/rules/font-weight-by-size.js';
import type { Contract } from '../../../src/lint/types.js';

const CONTRACT: Contract = {
  version: 1,
  global: {
    requiredContainer: { selector: '.playbook-container', mustExist: true },
    scroll: { soleScrollContainer: ['body'] },
    typography: {
      fontFamilyRootMustInclude: 'Delight',
      fontWeightAllowed: [400, 500],
      fontWeightRestrictions: [{ minFontSizePx: 24, allowed: [400] }],
    },
    links: { anchorRequiredAttrs: ['target', 'rel'] },
  },
  components: [],
};

const CONTRACT_NO_RESTRICTION: Contract = {
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
  components: [],
};

describe('font-weight-by-size', () => {
  it('no-op when no restrictions configured', () => {
    const m = buildModel(
      parseHtml('<style>h1 { font-size: 28px; font-weight: 500; }</style>'),
      CONTRACT_NO_RESTRICTION
    );
    expect(fontWeightBySize(m, CONTRACT_NO_RESTRICTION)).toEqual([]);
  });

  it('errors when font-size >= 24px and font-weight not in allowed list', () => {
    const m = buildModel(
      parseHtml('<style>h1 { font-size: 28px; font-weight: 500; }</style>'),
      CONTRACT
    );
    const findings = fontWeightBySize(m, CONTRACT);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.selector).toBe('h1');
    expect(findings[0]!.message).toContain('28px');
  });

  it('passes when font-size below threshold', () => {
    const m = buildModel(
      parseHtml('<style>p { font-size: 14px; font-weight: 500; }</style>'),
      CONTRACT
    );
    expect(fontWeightBySize(m, CONTRACT)).toEqual([]);
  });

  it('passes when font-size >= threshold but weight is allowed', () => {
    const m = buildModel(
      parseHtml('<style>h1 { font-size: 32px; font-weight: 400; }</style>'),
      CONTRACT
    );
    expect(fontWeightBySize(m, CONTRACT)).toEqual([]);
  });

  it('supports rem units (1.5rem >= 24px)', () => {
    const m = buildModel(
      parseHtml('<style>h1 { font-size: 1.5rem; font-weight: 500; }</style>'),
      CONTRACT
    );
    expect(fontWeightBySize(m, CONTRACT)).toHaveLength(1);
  });

  it('errors on inline style at large font-size with disallowed weight', () => {
    const m = buildModel(
      parseHtml('<h1 style="font-size: 28px; font-weight: 500">x</h1>'),
      CONTRACT
    );
    const findings = fontWeightBySize(m, CONTRACT);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('h1');
  });

  it('ignores rules that declare only one of font-size or font-weight', () => {
    const m = buildModel(
      parseHtml(
        '<style>h1 { font-size: 28px; } h2 { font-weight: 500; }</style>'
      ),
      CONTRACT
    );
    expect(fontWeightBySize(m, CONTRACT)).toEqual([]);
  });

  it('handles font-weight keyword "bold"', () => {
    const m = buildModel(
      parseHtml('<style>h1 { font-size: 30px; font-weight: bold; }</style>'),
      CONTRACT
    );
    expect(fontWeightBySize(m, CONTRACT)).toHaveLength(1);
  });
});
