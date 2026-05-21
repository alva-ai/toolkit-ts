import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../../src/lint/parser.js';
import { buildModel } from '../../../src/lint/model.js';
import { anchorAttrs } from '../../../src/lint/rules/anchor-attrs.js';
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
  components: [],
};

describe('anchor-attrs', () => {
  it('passes when <a href> has both target and rel', () => {
    const m = buildModel(
      parseHtml('<a href="/x" target="_blank" rel="noopener">x</a>'),
      CONTRACT
    );
    expect(anchorAttrs(m, CONTRACT)).toEqual([]);
  });

  it('errors when missing target', () => {
    const m = buildModel(
      parseHtml('<a href="/x" rel="noopener">x</a>'),
      CONTRACT
    );
    expect(anchorAttrs(m, CONTRACT)).toHaveLength(1);
  });

  it('errors when missing rel', () => {
    const m = buildModel(
      parseHtml('<a href="/x" target="_blank">x</a>'),
      CONTRACT
    );
    expect(anchorAttrs(m, CONTRACT)).toHaveLength(1);
  });

  it('ignores <a> without href', () => {
    const m = buildModel(parseHtml('<a>noop</a>'), CONTRACT);
    expect(anchorAttrs(m, CONTRACT)).toEqual([]);
  });
});

describe('anchor-attrs rel-must-contain', () => {
  const CONTRACT_REL: Contract = {
    version: 1,
    global: {
      requiredContainer: { selector: '.playbook-container', mustExist: true },
      scroll: { soleScrollContainer: ['body'] },
      typography: {
        fontFamilyRootMustInclude: 'Delight',
        fontWeightAllowed: [400, 500],
      },
      links: {
        anchorRequiredAttrs: ['target', 'rel'],
        relMustContain: ['noopener', 'noreferrer'],
      },
    },
    components: [],
  };

  it('passes when rel contains all required tokens', () => {
    const m = buildModel(
      parseHtml('<a href="/x" target="_blank" rel="noopener noreferrer">x</a>'),
      CONTRACT_REL
    );
    expect(anchorAttrs(m, CONTRACT_REL)).toEqual([]);
  });

  it('errors when rel is missing some required tokens', () => {
    const m = buildModel(
      parseHtml('<a href="/x" target="_blank" rel="noopener">x</a>'),
      CONTRACT_REL
    );
    const findings = anchorAttrs(m, CONTRACT_REL);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('noreferrer');
  });

  it('errors only once for both missing tokens', () => {
    const m = buildModel(
      parseHtml('<a href="/x" target="_blank" rel="external">x</a>'),
      CONTRACT_REL
    );
    const findings = anchorAttrs(m, CONTRACT_REL);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('noopener');
    expect(findings[0]!.message).toContain('noreferrer');
  });

  it('does NOT double-report when rel attribute is entirely missing', () => {
    const m = buildModel(
      parseHtml('<a href="/x" target="_blank">x</a>'),
      CONTRACT_REL
    );
    const findings = anchorAttrs(m, CONTRACT_REL);
    // Exactly one finding: the existing "missing rel" error from the
    // required-attrs pass, NOT a second rel-must-contain finding.
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("missing required attribute 'rel'");
  });

  it('is case-insensitive on rel tokens', () => {
    const m = buildModel(
      parseHtml('<a href="/x" target="_blank" rel="NOOPENER NOREFERRER">x</a>'),
      CONTRACT_REL
    );
    expect(anchorAttrs(m, CONTRACT_REL)).toEqual([]);
  });
});
