import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../../src/lint/parser.js';
import { buildModel } from '../../../src/lint/model.js';
import { requiredScriptFragments } from '../../../src/lint/rules/required-script-fragments.js';
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
      name: 'tab',
      root: 'tab',
      requiredScripts: [
        {
          whenAlso: ['chart-card'],
          mustContain: [
            '[_echarts_instance_]',
            'echarts.getInstanceByDom',
            '.resize()',
          ],
          message: 'ECharts must be resized on tab switch.',
        },
      ],
    },
    { name: 'chart-card', root: 'chart-container' },
  ],
};

describe('required-script-fragments', () => {
  it('is a no-op when the owner component is absent', () => {
    const m = buildModel(parseHtml('<div></div>'), CONTRACT);
    expect(requiredScriptFragments(m, CONTRACT)).toEqual([]);
  });

  it('is a no-op when whenAlso condition is unmet', () => {
    // tab present, chart-card absent
    const html = '<div class="tab"></div><script>doSomething();</script>';
    const m = buildModel(parseHtml(html), CONTRACT);
    expect(requiredScriptFragments(m, CONTRACT)).toEqual([]);
  });

  it('passes when all substrings present in a <script>', () => {
    const html = `
      <div class="tab"></div>
      <div class="chart-container"></div>
      <script>
        document.querySelectorAll(".tab").forEach(function(t){
          t.addEventListener("click", function(){
            active.querySelectorAll("[_echarts_instance_]").forEach(function (el) {
              var inst = echarts.getInstanceByDom(el);
              if (inst) inst.resize();
            });
          });
        });
      </script>
    `;
    const m = buildModel(parseHtml(html), CONTRACT);
    expect(requiredScriptFragments(m, CONTRACT)).toEqual([]);
  });

  it('errors with one finding per missing substring', () => {
    const html = `
      <div class="tab"></div>
      <div class="chart-container"></div>
      <script>console.log('hello');</script>
    `;
    const m = buildModel(parseHtml(html), CONTRACT);
    const f = requiredScriptFragments(m, CONTRACT);
    expect(f).toHaveLength(3);
    expect(f.map((x) => x.rule)).toEqual([
      'required-script-fragments',
      'required-script-fragments',
      'required-script-fragments',
    ]);
    expect(f.some((x) => x.message.includes('echarts.getInstanceByDom'))).toBe(
      true
    );
  });
});
