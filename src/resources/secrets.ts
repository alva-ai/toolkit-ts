import type { AlvaClient } from '../client.js';
import type { CreateSecretRequest, Secret, SecretMetadata } from '../types.js';

export class SecretsResource {
  constructor(private client: AlvaClient) {}

  async create(params: CreateSecretRequest): Promise<void> {
    this.client._requireAuth();
    await this.client._request('POST', '/api/v1/secrets', {
      body: { name: params.name, value: params.value },
    });
  }

  async list(): Promise<{ secrets: SecretMetadata[] }> {
    this.client._requireAuth();
    return this.client._request('GET', '/api/v1/secrets') as Promise<{
      secrets: SecretMetadata[];
    }>;
  }

  async get(params: { name: string }): Promise<Secret> {
    this.client._requireAuth();
    const encoded = encodeURIComponent(params.name);
    return this.client._request(
      'GET',
      `/api/v1/secrets/${encoded}`
    ) as Promise<Secret>;
  }

  async update(params: { name: string; value: string }): Promise<void> {
    this.client._requireAuth();
    const encoded = encodeURIComponent(params.name);
    await this.client._request('PUT', `/api/v1/secrets/${encoded}`, {
      body: { value: params.value },
    });
  }

  async delete(params: { name: string }): Promise<void> {
    this.client._requireAuth();
    const encoded = encodeURIComponent(params.name);
    await this.client._request('DELETE', `/api/v1/secrets/${encoded}`);
  }
}
