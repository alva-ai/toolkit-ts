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

  describe('whenScriptContains — semantic trigger (naming-independent)', () => {
    const SEMANTIC_CONTRACT: Contract = {
      ...CONTRACT,
      components: [
        {
          name: 'tab',
          root: 'tab',
          requiredScripts: [
            {
              whenScriptContains: ['echarts.init'],
              mustContain: [
                '[_echarts_instance_]',
                'echarts.getInstanceByDom',
                '.resize()',
              ],
              message:
                'ECharts in any tab playbook must be resized on tab switch.',
            },
          ],
        },
      ],
    };

    it('fires when tab present + echarts.init in script + resize handler missing (no .chart-container needed)', () => {
      // The playbook uses ad-hoc chart wrapper class but tab + ECharts is real
      const html = `
        <div class="tab tab-underline tab-l"></div>
        <div class="chart-body h280" id="c"></div>
        <script>
          var c = echarts.init(document.getElementById('c'));
          c.setOption({ /* ... */ });
        </script>
      `;
      const m = buildModel(parseHtml(html), SEMANTIC_CONTRACT);
      const f = requiredScriptFragments(m, SEMANTIC_CONTRACT);
      expect(f.length).toBeGreaterThan(0);
      expect(
        f.some((x) => x.message.includes('echarts.getInstanceByDom'))
      ).toBe(true);
      // Message attribution includes the semantic trigger context
      expect(f[0]!.message).toMatch(/script contains.*echarts\.init/);
    });

    it('does not fire when echarts.init absent (rule skipped — no false positives on non-chart playbooks)', () => {
      const html = `
        <div class="tab tab-underline tab-l"></div>
        <script>console.log("no charts here");</script>
      `;
      const m = buildModel(parseHtml(html), SEMANTIC_CONTRACT);
      expect(requiredScriptFragments(m, SEMANTIC_CONTRACT)).toEqual([]);
    });

    it('passes when echarts.init present and resize handler also present', () => {
      const html = `
        <div class="tab tab-underline tab-l"></div>
        <div class="chart-body h280" id="c"></div>
        <script>
          var c = echarts.init(document.getElementById('c'));
          document.querySelectorAll(".tab-item").forEach(function(t){
            t.addEventListener("click", function(){
              document.querySelectorAll("[_echarts_instance_]").forEach(function(el){
                var inst = echarts.getInstanceByDom(el);
                if (inst) inst.resize();
              });
            });
          });
        </script>
      `;
      const m = buildModel(parseHtml(html), SEMANTIC_CONTRACT);
      expect(requiredScriptFragments(m, SEMANTIC_CONTRACT)).toEqual([]);
    });

    it('AND-conjunctive: when both whenAlso and whenScriptContains are set, both must pass', () => {
      const ANDED: Contract = {
        ...CONTRACT,
        components: [
          {
            name: 'tab',
            root: 'tab',
            requiredScripts: [
              {
                whenAlso: ['chart-card'],
                whenScriptContains: ['echarts.init'],
                mustContain: ['.resize()'],
              },
            ],
          },
          { name: 'chart-card', root: 'chart-container' },
        ],
      };
      // chart-card absent → no fire even though echarts.init is in script
      const m1 = buildModel(
        parseHtml('<div class="tab"></div><script>echarts.init(x);</script>'),
        ANDED
      );
      expect(requiredScriptFragments(m1, ANDED)).toEqual([]);
      // both present → fires
      const m2 = buildModel(
        parseHtml(
          '<div class="tab"></div><div class="chart-container"></div><script>echarts.init(x);</script>'
        ),
        ANDED
      );
      expect(requiredScriptFragments(m2, ANDED).length).toBeGreaterThan(0);
    });
  });
});
