import { requiredContainerRule } from './required-container.js';
import { requiredStylesheetRule } from './required-stylesheet.js';
import { singleScrollContainerRule } from './single-scroll-container.js';
import { fontWeightRangeRule } from './font-weight-range.js';
import { fontWeightBySizeRule } from './font-weight-by-size.js';
import { fontFamilyRootRule } from './font-family-root.js';
import { anchorAttrsRule } from './anchor-attrs.js';
import { antiAliasingDeclarationsRule } from './anti-aliasing-declarations.js';
import { knownComponentClassRule } from './known-component-class.js';
import { componentRequiredStructureRule } from './component-required-structure.js';
import { elementComponentBindingRule } from './element-component-binding.js';
import { requiredScriptFragmentsRule } from './required-script-fragments.js';
import { forbidCoreSelectorOverrideRule } from './forbid-core-selector-override.js';
import type { RuleDescriptor } from '../types.js';

export const ALL_RULES: RuleDescriptor[] = [
  requiredContainerRule,
  requiredStylesheetRule,
  singleScrollContainerRule,
  fontWeightRangeRule,
  fontWeightBySizeRule,
  fontFamilyRootRule,
  anchorAttrsRule,
  antiAliasingDeclarationsRule,
  knownComponentClassRule,
  componentRequiredStructureRule,
  elementComponentBindingRule,
  requiredScriptFragmentsRule,
  forbidCoreSelectorOverrideRule,
];
