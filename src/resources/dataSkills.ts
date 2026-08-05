import type { AlvaClient } from '../client.js';
import {
  getSkillEndpointMetadata,
  listSkillEndpointMetadata,
  type SkillEndpointMetadata,
  type SkillEndpointTier,
} from './skillEndpoints.js';

type Envelope<T> = { success: boolean; data: T; request_id?: string };

export type { SkillEndpointMetadata, SkillEndpointTier };

export interface SkillMetadata {
  endpoint_count: number;
  /** @deprecated Data-skills no longer adds local endpoint tier metadata. */
  endpoint_tier_counts?: Partial<Record<SkillEndpointTier, number>>;
  /** @deprecated Data-skills no longer adds local endpoint tier metadata. */
  pro_count?: number;
}

export interface SkillSummary {
  name: string;
  description: string;
  metadata?: SkillMetadata;
  /** @deprecated Data-skills no longer adds this local metadata. */
  endpoint_tier_counts?: Partial<Record<SkillEndpointTier, number>>;
}

export interface SkillDoc {
  name: string;
  description: string;
  content: string;
  metadata?: SkillMetadata | SkillEndpointMetadata;
  endpoint_metadata?: SkillEndpointMetadata[];
  /** @deprecated Data-skills no longer adds this local metadata. */
  endpoint_tier_counts?: Partial<Record<SkillEndpointTier, number>>;
}

export class DataSkillsResource {
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
} {
  const endpointCount = listSkillEndpointMetadata(skill).length;
  if (endpointCount === 0) return {};
  return { metadata: { endpoint_count: endpointCount } };
}
