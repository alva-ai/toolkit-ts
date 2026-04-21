import type { AlvaClient } from '../client.js';

type Envelope<T> = { success: boolean; data: T; request_id?: string };

export interface SkillSummary {
  name: string;
  description: string;
}

export interface SkillDoc {
  name: string;
  description: string;
  content: string;
}

export class SkillsResource {
  constructor(private client: AlvaClient) {}

  async list(): Promise<{ skills: SkillSummary[] }> {
    const res = (await this.client._request('GET', '/api/v1/skills', {
      baseUrl: this.client.arraysBaseUrl,
      noAuth: true,
    })) as Envelope<SkillSummary[]>;
    return { skills: res.data ?? [] };
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
    return doc;
  }

  async endpoint(params: { name: string; path: string }): Promise<SkillDoc> {
    const encoded = encodeURIComponent(params.name);
    const res = (await this.client._request(
      'GET',
      `/api/v1/skills/${encoded}`,
      {
        baseUrl: this.client.arraysBaseUrl,
        noAuth: true,
        query: { endpoint: params.path },
      }
    )) as Envelope<SkillDoc[]>;
    const doc = res.data?.[0];
    if (!doc) {
      throw new Error(
        `empty skills endpoint response for "${params.name}" path "${params.path}"`
      );
    }
    return doc;
  }
}
