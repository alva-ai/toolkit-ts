import type { AlvaClient } from '../client.js';
import type {
  CronjobCreateRequest,
  Cronjob,
  CronjobListParams,
  CronjobListResponse,
  CronjobUpdateRequest,
  CronjobRunsListParams,
  CronjobRunsListResponse,
  CronjobRunLogsResponse,
  CronjobTriggerResponse,
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

  /**
   * Fire the cronjob workflow once, immediately, bypassing the schedule.
   * Async — returns the Hatchet workflow run id at enqueue. The
   * `cronjob_runs` row appears only after the worker finishes the run;
   * callers verify completion by polling `listRuns({cronjob_id})` and
   * matching `runs[].workflow_run_id` against the returned id.
   *
   * Surfaces backend status as HTTP errors (handled by AlvaClient):
   * - 404 not found / cross-user
   * - 412 cronjob is paused (resume before triggering)
   * - 503 worker workflow handle not yet connected (startup race)
   */
  async trigger(params: { id: number }): Promise<CronjobTriggerResponse> {
    this.client._requireAuth();
    return this.client._request(
      'POST',
      `/api/v1/deploy/cronjob/${params.id}/trigger`
    ) as Promise<CronjobTriggerResponse>;
  }

  async listRuns(
    params: CronjobRunsListParams
  ): Promise<CronjobRunsListResponse> {
    this.client._requireAuth();
    return this.client._request(
      'GET',
      `/api/v1/deploy/cronjob/${params.cronjob_id}/runs`,
      {
        query: { first: params.first, cursor: params.cursor },
      }
    ) as Promise<CronjobRunsListResponse>;
  }

  async getRunLogs(params: {
    cronjob_id: number;
    run_id: number;
  }): Promise<CronjobRunLogsResponse> {
    this.client._requireAuth();
    return this.client._request(
      'GET',
      `/api/v1/deploy/cronjob/${params.cronjob_id}/runs/${params.run_id}/logs`
    ) as Promise<CronjobRunLogsResponse>;
  }
}
