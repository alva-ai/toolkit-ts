import type { AlvaClient } from '../client.js';
import type {
  CronjobCreateRequest,
  Cronjob,
  CronjobListParams,
  CronjobListResponse,
  CronjobUpdateRequest,
  CronjobRunsListParams,
  CronjobRunsListResponse,
  CronjobRunStatusParams,
  CronjobRunStatusResponse,
  CronjobRunLogsResponse,
  CronjobTriggerResponse,
} from '../types.js';
import {
  objectWithRawJSONField,
  serializeStructuredArgs,
} from '../jsonPayload.js';

export class DeployResource {
  constructor(private client: AlvaClient) {}

  async create(params: CronjobCreateRequest): Promise<Cronjob> {
    this.client._requireAuth();
    return params.args === undefined
      ? this.createRequest(params)
      : this.createRequest(params, serializeStructuredArgs(params.args));
  }

  /** @internal Used by the CLI to preserve the exact --args JSON text. */
  async _createSerializedArgs(
    params: CronjobCreateRequest,
    serializedArgs: string
  ): Promise<Cronjob> {
    this.client._requireAuth();
    return this.createRequest(params, serializedArgs);
  }

  private createRequest(
    params: CronjobCreateRequest,
    serializedArgs?: string
  ): Promise<Cronjob> {
    const body = {
      name: params.name,
      path: params.path,
      cron_expression: params.cron_expression,
      args: params.args,
      push_notify: params.push_notify,
      max_heap_size_mb: params.max_heap_size_mb,
      execution_timeout_seconds: params.execution_timeout_seconds,
      run_as_user_id: params.run_as_user_id,
      start_at: params.start_at,
      end_at: params.end_at,
      max_runs: params.max_runs,
    };
    return this.client._request('POST', '/api/v1/deploy/cronjob', {
      ...(serializedArgs === undefined
        ? { body }
        : {
            jsonBody: objectWithRawJSONField(body, 'args', serializedArgs),
          }),
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
    return params.args === undefined
      ? this.updateRequest(params)
      : this.updateRequest(params, serializeStructuredArgs(params.args));
  }

  /** @internal Used by the CLI to preserve the exact --args JSON text. */
  async _updateSerializedArgs(
    params: CronjobUpdateRequest,
    serializedArgs: string
  ): Promise<Cronjob> {
    this.client._requireAuth();
    return this.updateRequest(params, serializedArgs);
  }

  private updateRequest(
    params: CronjobUpdateRequest,
    serializedArgs?: string
  ): Promise<Cronjob> {
    const { id, ...body } = params;
    return this.client._request('PATCH', `/api/v1/deploy/cronjob/${id}`, {
      ...(serializedArgs === undefined
        ? { body }
        : {
            jsonBody: objectWithRawJSONField(body, 'args', serializedArgs),
          }),
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
   * This is not a dry run: when publisher push and subscriber alert bindings
   * are enabled, a successful Feed execution may send real notifications.
   * Async — returns the Hatchet workflow run id at enqueue. The
   * `cronjob_runs` row can appear as DISPATCHED/RUNNING before it reaches a
   * terminal status; callers verify completion by polling
   * `getRunStatus({cronjob_id, workflow_run_id})` with their own
   * timeout/deadline.
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

  async getRunStatus(
    params: CronjobRunStatusParams
  ): Promise<CronjobRunStatusResponse> {
    this.client._requireAuth();
    return this.client._request(
      'GET',
      `/api/v1/deploy/cronjob/${params.cronjob_id}/runs/by-workflow/${encodeURIComponent(params.workflow_run_id)}`
    ) as Promise<CronjobRunStatusResponse>;
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
