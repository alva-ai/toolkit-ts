import type { AlvaClient } from '../client.js';
import { v2Path, type Schema, type V2Query } from '../platformApi.js';

export interface SecretWriteOptions {
  /** Idempotency-Key of the write; a new UUID when omitted. */
  idempotencyKey?: string;
}

/**
 * The caller's secrets. /api/v2 returns metadata only (`Secret`); reading a
 * value is `client.v1.secrets.get`.
 */
export class SecretsResource {
  constructor(private client: AlvaClient) {}

  /** Stores a new secret; refused when the name exists. */
  async create(
    params: { name: string; value: string },
    options: SecretWriteOptions = {}
  ): Promise<Schema<'Secret'>> {
    return this.set({ ...params, mustExist: false }, options);
  }

  /** Replaces the value of an existing secret; refused when there is none. */
  async update(
    params: { name: string; value: string },
    options: SecretWriteOptions = {}
  ): Promise<Schema<'Secret'>> {
    return this.set({ ...params, mustExist: true }, options);
  }

  /** One page of the caller's secrets. */
  async list(
    query: V2Query<'/me/secrets', 'get'> = {}
  ): Promise<Schema<'SecretList'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/secrets', { query });
  }

  /** Deletes a secret by its ID. */
  async delete(secretId: string): Promise<Schema<'Deleted'>> {
    this.client._requireAuth();
    return this.client._v2Request('DELETE', v2Path`/me/secrets/${secretId}`);
  }

  private async set(
    body: Schema<'SetSecretRequest'>,
    options: SecretWriteOptions
  ): Promise<Schema<'Secret'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/me/secrets', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }
}
