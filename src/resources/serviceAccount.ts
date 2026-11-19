import type { AlvaClient } from '../client.js';
import { collectAll, v2Path } from '../platformApi.js';
import type {
  AlvaId,
  ServiceAccount,
  ServiceAccountCreateRequest,
  ServiceAccountCreateResponse,
  ServiceAccountGrant,
  ServiceAccountGrantRequest,
  ServiceAccountListResponse,
  ServiceAccountRevokeRequest,
} from '../types.js';

/** A ServiceAccount of /api/v2/me/service-accounts. */
interface WireServiceAccount {
  id: AlvaId;
  displayName: string;
  username: string;
  ownerId: AlvaId;
  createdAt: string | null;
}

function serviceAccount(sa: WireServiceAccount): ServiceAccount {
  return {
    id: sa.id,
    display_name: sa.displayName,
    username: sa.username,
    parent_user_id: sa.ownerId,
    ...(sa.createdAt ? { created_at: Date.parse(sa.createdAt) } : {}),
  };
}

/**
 * Service-account lifecycle: create a restricted run-as identity, list/delete
 * the ones you own, and grant/revoke its ALFS paths. Set the resulting id as
 * `--run-as-service-account` on a UDF or cronjob to run it under that scoped
 * identity (billing/audit stay with you). See the service-accounts skill
 * reference. Owner-gated by the backend — an SA cannot manage SAs.
 */
export class ServiceAccountResource {
  constructor(private client: AlvaClient) {}

  async create(
    params: ServiceAccountCreateRequest
  ): Promise<ServiceAccountCreateResponse> {
    this.client._requireAuth();
    const sa = await this.client._v2Request<WireServiceAccount>(
      'POST',
      '/me/service-accounts',
      { body: { displayName: params.display_name } }
    );
    return { service_account: serviceAccount(sa) };
  }

  async list(): Promise<ServiceAccountListResponse> {
    this.client._requireAuth();
    const accounts = await collectAll(
      this.client._v2Pages<WireServiceAccount>('/me/service-accounts', {
        pageSize: 200,
      })
    );
    return { service_accounts: accounts.map(serviceAccount) };
  }

  async delete(params: { id: AlvaId }): Promise<void> {
    this.client._requireAuth();
    await this.client._v2Request(
      'DELETE',
      v2Path`/me/service-accounts/${params.id}`
    );
  }

  /**
   * Grants a permission on a path. Granting the same pair again returns the
   * same grant; its `id` is what `revoke` takes.
   */
  async grant(
    params: ServiceAccountGrantRequest
  ): Promise<ServiceAccountGrant> {
    this.client._requireAuth();
    const grant = await this.client._v2Request<{
      id: AlvaId;
      serviceAccountId: AlvaId;
      path: string;
      permission: string;
    }>('POST', v2Path`/me/service-accounts/${params.id}/grants`, {
      body: { path: params.path, permission: params.permission.toUpperCase() },
    });
    return {
      id: grant.id,
      service_account_id: grant.serviceAccountId,
      path: grant.path,
      permission: grant.permission.toLowerCase(),
    };
  }

  /** Revokes one grant by the ID `grant` returned. */
  async revoke(params: ServiceAccountRevokeRequest): Promise<void> {
    this.client._requireAuth();
    await this.client._v2Request(
      'DELETE',
      v2Path`/me/service-accounts/${params.id}/grants/${params.grant_id}`
    );
  }
}

export type {
  ServiceAccount,
  ServiceAccountCreateRequest,
  ServiceAccountCreateResponse,
  ServiceAccountGrant,
  ServiceAccountListResponse,
  ServiceAccountGrantRequest,
  ServiceAccountRevokeRequest,
};
