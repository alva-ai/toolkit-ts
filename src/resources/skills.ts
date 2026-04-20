import type { AlvaClient } from '../client.js';

export class SkillsResource {
  constructor(private client: AlvaClient) {}

  async list(): Promise<unknown> {
    return this.client._request('GET', '/api/v1/skills', {
      baseUrl: this.client.arraysBaseUrl,
      noAuth: true,
    });
  }

  async summary(params: { name: string }): Promise<unknown> {
    const encoded = encodeURIComponent(params.name);
    return this.client._request('GET', `/api/v1/skills/${encoded}`, {
      baseUrl: this.client.arraysBaseUrl,
      noAuth: true,
    });
  }

  async endpoint(params: { name: string; path: string }): Promise<unknown> {
    const encoded = encodeURIComponent(params.name);
    return this.client._request('GET', `/api/v1/skills/${encoded}`, {
      baseUrl: this.client.arraysBaseUrl,
      noAuth: true,
      query: { endpoint: params.path },
    });
  }
}
