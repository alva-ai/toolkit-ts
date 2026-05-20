// src/lint/contract.ts
import YAML from 'yaml';
import type { Contract, ComponentSpec, BindingRule } from './types.js';

interface RawComponent {
  root?: string;
  variants?: string[];
  sizes?: string[];
  states?: string[];
  children?: string[];
  bindings?: Array<{ selector: string; 'require-class': string }>;
}

interface RawYaml {
  version?: number;
  description?: string;
  global?: {
    'required-container'?: { selector: string; 'must-exist': boolean };
    scroll?: { 'sole-scroll-container': string[] };
    typography?: {
      'font-family-root-must-include': string;
      'font-weight-allowed': number[];
    };
    links?: { 'anchor-required-attrs': string[] };
  };
  components?: Record<string, RawComponent>;
}

export function loadContract(yamlStr: string): Contract {
  const raw = YAML.parse(yamlStr) as RawYaml;
  if (!raw || typeof raw.version !== 'number') {
    throw new Error('contract: missing or invalid `version`');
  }
  if (!raw.global) {
    throw new Error('contract: missing `global`');
  }

  const g = raw.global;

  // Validate components first so component errors surface before global structure errors.
  const components: ComponentSpec[] = [];
  for (const [name, c] of Object.entries(raw.components ?? {})) {
    if (!c.root) {
      throw new Error(
        `contract: component '${name}' missing required \`root\``
      );
    }
    const bindings: BindingRule[] | undefined = c.bindings?.map((b) => ({
      selector: b.selector,
      requireClass: b['require-class'],
    }));
    components.push({
      name,
      root: c.root,
      variants: c.variants,
      sizes: c.sizes,
      states: c.states,
      children: c.children,
      bindings,
    });
  }

  const required = g['required-container'];
  const scroll = g.scroll;
  const typo = g.typography;
  const links = g.links;
  if (!required) throw new Error('contract: missing global.required-container');
  if (!scroll) throw new Error('contract: missing global.scroll');
  if (!typo) throw new Error('contract: missing global.typography');
  if (!links) throw new Error('contract: missing global.links');

  return {
    version: raw.version,
    description: raw.description,
    global: {
      requiredContainer: {
        selector: required.selector,
        mustExist: required['must-exist'],
      },
      scroll: { soleScrollContainer: scroll['sole-scroll-container'] },
      typography: {
        fontFamilyRootMustInclude: typo['font-family-root-must-include'],
        fontWeightAllowed: typo['font-weight-allowed'],
      },
      links: { anchorRequiredAttrs: links['anchor-required-attrs'] },
    },
    components,
  };
}
