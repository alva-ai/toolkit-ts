import type { AlvaClient } from '../client.js';
import type {
  ServiceAccount,
  ServiceAccountCreateRequest,
  ServiceAccountCreateResponse,
  ServiceAccountListResponse,
  ServiceAccountGrantRequest,
} from '../types.js';

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
    return this.client._request('POST', '/api/v1/service-account', {
      body: { display_name: params.display_name },
    }) as Promise<ServiceAccountCreateResponse>;
  }

  async list(): Promise<ServiceAccountListResponse> {
    this.client._requireAuth();
    return this.client._request(
      'GET',
      '/api/v1/service-accounts'
    ) as Promise<ServiceAccountListResponse>;
  }

  async delete(params: { id: number }): Promise<void> {
    this.client._requireAuth();
    await this.client._request('DELETE', `/api/v1/service-account/${params.id}`);
  }

  async grant(params: ServiceAccountGrantRequest): Promise<void> {
    this.client._requireAuth();
    await this.client._request(
      'POST',
      `/api/v1/service-account/${params.id}/grant`,
      { body: { path: params.path, permission: params.permission } }
    );
  }

  async revoke(params: ServiceAccountGrantRequest): Promise<void> {
    this.client._requireAuth();
    await this.client._request(
      'POST',
      `/api/v1/service-account/${params.id}/revoke`,
      { body: { path: params.path, permission: params.permission } }
    );
  }
}

export type {
  ServiceAccount,
  ServiceAccountCreateRequest,
  ServiceAccountCreateResponse,
  ServiceAccountListResponse,
  ServiceAccountGrantRequest,
};
