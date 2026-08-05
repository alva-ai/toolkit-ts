import { describe, expect, it } from 'vitest';
import {
  countSkillEndpointMetadata,
  listSkillEndpointMetadata,
} from '../../src/resources/skillEndpoints.js';

describe('skill endpoint metadata', () => {
  it('keeps the endpoint registry without subscription-tier fields', () => {
    const endpoints = listSkillEndpointMetadata('arrays-data-api-options');

    expect(endpoints.map((endpoint) => endpoint.file)).toEqual([
      'contracts',
      'kline',
      'greeks',
      'chain',
    ]);
    for (const endpoint of endpoints) {
      expect(endpoint).toEqual({
        skill: 'arrays-data-api-options',
        file: endpoint.file,
        method: 'GET',
        path: endpoint.path,
      });
      expect(endpoint).not.toHaveProperty('tier');
      expect(endpoint).not.toHaveProperty('access');
      expect(endpoint).not.toHaveProperty('required_subscription_tier');
      expect(endpoint).not.toHaveProperty('pro_required');
    }
    expect(countSkillEndpointMetadata()).toBe(119);
  });
});
