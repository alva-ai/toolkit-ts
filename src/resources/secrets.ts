import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { collectAll, v2Path } from '../platformApi.js';
import type {
  AlvaId,
  CreateSecretRequest,
  Secret,
  SecretMetadata,
} from '../types.js';

/** A Secret of /api/v2/me/secrets: metadata, never the value. */
interface WireSecret {
  id: AlvaId;
  name: string;
  version: number;
  prefix: string;
  valueLength: number;
  createdAt: string;
  updatedAt: string;
}

export class SecretsResource {
  constructor(private client: AlvaClient) {}

  async create(params: CreateSecretRequest): Promise<void> {
    this.client._requireAuth();
    await this.client._v2Request('POST', '/me/secrets', {
      body: { name: params.name, value: params.value, mustExist: false },
    });
  }

  async list(): Promise<{ secrets: SecretMetadata[] }> {
    this.client._requireAuth();
    const secrets = await this.all();
    return {
      secrets: secrets.map((s) => ({
        id: s.id,
        name: s.name,
        keyVersion: s.version,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        valueLength: s.valueLength,
        keyPrefix: s.prefix,
      })),
    };
  }

  /**
   * Reads the value. /api/v2 never returns a secret's value, so this one call
   * stays on /api/v1.
   */
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
    await this.client._v2Request('POST', '/me/secrets', {
      body: { name: params.name, value: params.value, mustExist: true },
    });
  }

  async delete(params: { name: string }): Promise<void> {
    this.client._requireAuth();
    const secret = (await this.all()).find((s) => s.name === params.name);
    if (!secret) {
      throw new AlvaError(
        'NOT_FOUND',
        `secret ${JSON.stringify(params.name)} not found`,
        404
      );
    }
    await this.client._v2Request('DELETE', v2Path`/me/secrets/${secret.id}`);
  }

  private all(): Promise<WireSecret[]> {
    return collectAll(
      this.client._v2Pages<WireSecret>('/me/secrets', { pageSize: 200 })
    );
  }
}
