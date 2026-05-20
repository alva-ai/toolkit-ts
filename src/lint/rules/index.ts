import { requiredContainerRule } from './required-container.js';
import { singleScrollContainerRule } from './single-scroll-container.js';
import { fontWeightRangeRule } from './font-weight-range.js';
import { fontFamilyRootRule } from './font-family-root.js';
import { anchorAttrsRule } from './anchor-attrs.js';
import { knownComponentClassRule } from './known-component-class.js';
import { componentRequiredStructureRule } from './component-required-structure.js';
import { elementComponentBindingRule } from './element-component-binding.js';
import type { RuleDescriptor } from '../types.js';

export const ALL_RULES: RuleDescriptor[] = [
  requiredContainerRule,
  singleScrollContainerRule,
  fontWeightRangeRule,
  fontFamilyRootRule,
  anchorAttrsRule,
  knownComponentClassRule,
  componentRequiredStructureRule,
  elementComponentBindingRule,
];
