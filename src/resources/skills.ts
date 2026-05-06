import type { AlvaClient } from '../client.js';
import {
  getSkillEndpointMetadata,
  listSkillEndpointMetadata,
  type SkillEndpointMetadata,
  type SkillEndpointTier,
} from './skillTiers.js';

type Envelope<T> = { success: boolean; data: T; request_id?: string };
type SkillTierCounts = Partial<Record<SkillEndpointTier, number>>;

export type { SkillEndpointMetadata, SkillEndpointTier };

export interface SkillMetadata {
  endpoint_count: number;
  endpoint_tier_counts: SkillTierCounts;
}

export interface SkillSummary {
  name: string;
  description: string;
  metadata?: SkillMetadata;
  endpoint_tier_counts?: SkillTierCounts;
}

export interface SkillDoc {
  name: string;
  description: string;
  content: string;
  metadata?: SkillMetadata | SkillEndpointMetadata;
  endpoint_metadata?: SkillEndpointMetadata[];
  endpoint_tier_counts?: SkillTierCounts;
}

export class SkillsResource {
  constructor(private client: AlvaClient) {}

  async list(): Promise<{ skills: SkillSummary[] }> {
    const res = (await this.client._request('GET', '/api/v1/skills', {
      baseUrl: this.client.arraysBaseUrl,
      noAuth: true,
    })) as Envelope<SkillSummary[]>;
    return {
      skills: (res.data ?? []).map((skill) => ({
        ...skill,
        ...metadataSummaryForSkill(skill.name),
      })),
    };
  }

  async summary(params: { name: string }): Promise<SkillDoc> {
    const encoded = encodeURIComponent(params.name);
    const res = (await this.client._request(
      'GET',
      `/api/v1/skills/${encoded}`,
      {
        baseUrl: this.client.arraysBaseUrl,
        noAuth: true,
      }
    )) as Envelope<SkillDoc[]>;
    const doc = res.data?.[0];
    if (!doc)
      throw new Error(`empty skills summary response for "${params.name}"`);
    const endpointMetadata = listSkillEndpointMetadata(params.name);
    return {
      ...doc,
      ...metadataSummaryForSkill(params.name),
      ...(endpointMetadata.length > 0
        ? { endpoint_metadata: endpointMetadata }
        : {}),
    };
  }

  async endpoint(params: { name: string; file: string }): Promise<SkillDoc> {
    const encoded = encodeURIComponent(params.name);
    const res = (await this.client._request(
      'GET',
      `/api/v1/skills/${encoded}`,
      {
        baseUrl: this.client.arraysBaseUrl,
        noAuth: true,
        query: { endpoint: params.file },
      }
    )) as Envelope<SkillDoc[]>;
    const doc = res.data?.[0];
    if (!doc) {
      throw new Error(
        `empty skills endpoint response for "${params.name}" file "${params.file}"`
      );
    }
    const metadata = getSkillEndpointMetadata(params.name, params.file);
    return {
      ...doc,
      ...(metadata ? { metadata } : {}),
    };
  }
}

function metadataSummaryForSkill(skill: string): {
  metadata?: SkillMetadata;
  endpoint_tier_counts?: SkillTierCounts;
} {
  const endpointMetadata = listSkillEndpointMetadata(skill);
  if (endpointMetadata.length === 0) {
    return {};
  }
  const counts: SkillTierCounts = {};
  for (const endpoint of endpointMetadata) {
    counts[endpoint.tier] = (counts[endpoint.tier] ?? 0) + 1;
  }
  return {
    endpoint_tier_counts: counts,
    metadata: {
      endpoint_count: endpointMetadata.length,
      endpoint_tier_counts: counts,
    },
  };
}
