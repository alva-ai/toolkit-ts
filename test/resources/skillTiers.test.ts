import { describe, expect, it } from 'vitest';
import {
  countSkillEndpointMetadata,
  listSkillEndpointMetadata,
} from '../../src/resources/skillTiers.js';

describe('skill tier metadata', () => {
  it('reports every Options endpoint as free access', () => {
    const endpoints = listSkillEndpointMetadata('arrays-data-api-options');

    expect(endpoints.map((endpoint) => endpoint.file)).toEqual([
      'contracts',
      'kline',
      'greeks',
      'chain',
    ]);
    for (const endpoint of endpoints) {
      expect(endpoint).toMatchObject({
        tier: 'public',
        required_subscription_tier: 'free',
        access: 'free_and_pro',
        pro_required: false,
      });
    }
    expect(countSkillEndpointMetadata()).toEqual({
      public: 62,
      alternative: 40,
      unstructured: 2,
    });
  });
});
