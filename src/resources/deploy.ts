import type { AlvaClient } from '../client.js';
import type {
  CronjobCreateRequest,
  Cronjob,
  CronjobListParams,
  CronjobListResponse,
  CronjobUpdateRequest,
} from '../types.js';

export class DeployResource {
  constructor(private client: AlvaClient) {}

  async create(params: CronjobCreateRequest): Promise<Cronjob> {
    this.client._requireAuth();
    return this.client._request('POST', '/api/v1/deploy/cronjob', {
      body: {
        name: params.name,
        path: params.path,
        cron_expression: params.cron_expression,
        args: params.args,
        push_notify: params.push_notify,
      },
    }) as Promise<Cronjob>;
  }

  async list(params?: CronjobListParams): Promise<CronjobListResponse> {
    this.client._requireAuth();
    return this.client._request('GET', '/api/v1/deploy/cronjobs', {
      query: { limit: params?.limit, cursor: params?.cursor },
    }) as Promise<CronjobListResponse>;
  }

  async get(params: { id: number }): Promise<Cronjob> {
    this.client._requireAuth();
    return this.client._request(
      'GET',
      `/api/v1/deploy/cronjob/${params.id}`
    ) as Promise<Cronjob>;
  }

  async update(params: CronjobUpdateRequest): Promise<Cronjob> {
    this.client._requireAuth();
    const { id, ...body } = params;
    return this.client._request('PATCH', `/api/v1/deploy/cronjob/${id}`, {
      body,
    }) as Promise<Cronjob>;
  }

  async delete(params: { id: number }): Promise<void> {
    this.client._requireAuth();
    await this.client._request('DELETE', `/api/v1/deploy/cronjob/${params.id}`);
  }

  async pause(params: { id: number }): Promise<void> {
    this.client._requireAuth();
    await this.client._request(
      'POST',
      `/api/v1/deploy/cronjob/${params.id}/pause`
    );
  }

  async resume(params: { id: number }): Promise<void> {
    this.client._requireAuth();
    await this.client._request(
      'POST',
      `/api/v1/deploy/cronjob/${params.id}/resume`
    );
  }
}
