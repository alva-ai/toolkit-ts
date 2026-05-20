import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../../src/lint/parser.js';
import { buildModel } from '../../../src/lint/model.js';
import { requiredContainer } from '../../../src/lint/rules/required-container.js';
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

describe('required-container rule', () => {
  it('passes when .playbook-container exists', () => {
    const m = buildModel(
      parseHtml('<div class="playbook-container"></div>'),
      CONTRACT
    );
    expect(requiredContainer(m, CONTRACT)).toEqual([]);
  });

  it('fails when .playbook-container missing', () => {
    const m = buildModel(parseHtml('<div class="other"></div>'), CONTRACT);
    const findings = requiredContainer(m, CONTRACT);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe('required-container');
    expect(findings[0]!.severity).toBe('error');
  });
});
