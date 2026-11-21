import type { AlvaClient } from '../client.js';
import { v2Path, type Schema, type V2Query } from '../platformApi.js';

export interface ServiceAccountWriteOptions {
  /** Idempotency-Key of the write; a new UUID when omitted. */
  idempotencyKey?: string;
}

/**
 * Service-account lifecycle: create a restricted run-as identity, list/delete
 * the ones you own, and grant/revoke its ALFS paths. Pass its Account ID as
 * `--run-as-service-account` on a UDF or cronjob to run it under that scoped
 * identity (billing/audit stay with you). See the service-accounts skill
 * reference. Owner-gated by the backend — an SA cannot manage SAs.
 */
export class ServiceAccountResource {
  constructor(private client: AlvaClient) {}

  async create(
    body: Schema<'CreateServiceAccountRequest'>,
    options: ServiceAccountWriteOptions = {}
  ): Promise<Schema<'ServiceAccount'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/me/service-accounts', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** One page of the caller's service accounts. */
  async list(
    query: V2Query<'/me/service-accounts', 'get'> = {}
  ): Promise<Schema<'ServiceAccountList'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/service-accounts', { query });
  }

  async delete(serviceAccountId: string): Promise<Schema<'Deleted'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'DELETE',
      v2Path`/me/service-accounts/${serviceAccountId}`
    );
  }

  /**
   * Grants a permission on a path. Granting the same pair again returns the
   * same grant; its `id` is what `revoke` takes.
   */
  async grant(
    serviceAccountId: string,
    body: Schema<'CreateServiceAccountGrantRequest'>,
    options: ServiceAccountWriteOptions = {}
  ): Promise<Schema<'ServiceAccountGrant'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'POST',
      v2Path`/me/service-accounts/${serviceAccountId}/grants`,
      { body, idempotencyKey: options.idempotencyKey }
    );
  }

  /** Revokes one grant by the ID `grant` returned. */
  async revoke(
    serviceAccountId: string,
    grantId: string
  ): Promise<Schema<'Deleted'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'DELETE',
      v2Path`/me/service-accounts/${serviceAccountId}/grants/${grantId}`
    );
  }
}
