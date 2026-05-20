// src/lint/types.ts

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  location?: { line: number; column: number };
  selector?: string;
}

export interface Report {
  findings: Finding[];
  summary: { errors: number; warnings: number; info: number };
}

export interface BindingRule {
  selector: string;
  requireClass: string;
}

export interface ComponentSpec {
  name: string;
  root: string;
  variants?: string[];
  sizes?: string[];
  states?: string[];
  children?: string[];
  bindings?: BindingRule[];
}

export interface FontWeightRestriction {
  minFontSizePx: number;
  allowed: number[];
}

export interface Contract {
  version: number;
  description?: string;
  global: {
    requiredContainer: { selector: string; mustExist: boolean };
    scroll: { soleScrollContainer: string[] };
    typography: {
      fontFamilyRootMustInclude: string;
      fontWeightAllowed: number[];
      fontWeightRestrictions?: FontWeightRestriction[];
    };
    links: {
      anchorRequiredAttrs: string[];
      relMustContain?: string[];
    };
    requiredStylesheets?: { url: string }[];
    antiAliasing?: { requiredDeclarations: string[] };
  };
  components: ComponentSpec[];
}

// Parser output (no dependency types leak across module boundary;
// rule modules receive the high-level ResolvedModel, not the raw DOM).
export interface CssRule {
  selectorText: string;
  declarations: Record<string, string>; // e.g. { 'overflow-y': 'auto', 'font-weight': '700' }
  sourceLine?: number;
}

export interface InlineStyle {
  /** opaque element handle for downstream rule code */
  elementKey: string;
  /** parsed inline `style="..."` declarations */
  declarations: Record<string, string>;
  tag: string;
  attrs: Record<string, string>;
  classes: string[];
  /** root subtree ownership; computed in model.ts */
  ownerComponentRoot?: string;
}

export interface DomModel {
  /** every element with its classes, tag, attrs, inline styles */
  elements: InlineStyle[];
  /** CSS rules extracted from <style> blocks */
  cssRules: CssRule[];
  /** raw HTML (for line/column reporting) */
  rawHtml: string;
}

export interface ResolvedModel {
  dom: DomModel;
  /** component name → root element keys present in this playbook */
  componentRoots: Map<string, string[]>;
  /** elementKey → name of nearest ancestor registered component, if any */
  componentOwnership: Map<string, string>;
}

export type RuleFn = (model: ResolvedModel, contract: Contract) => Finding[];

export interface RuleDescriptor {
  name: string;
  severity: Severity;
  run: RuleFn;
}
