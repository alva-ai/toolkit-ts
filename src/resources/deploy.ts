import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { v2Path, type Page } from '../platformApi.js';
import type {
  AlvaId,
  CronjobCreateRequest,
  Cronjob,
  CronjobListParams,
  CronjobListResponse,
  CronjobUpdateRequest,
  CronjobRun,
  CronjobRunsListParams,
  CronjobRunsListResponse,
  CronjobRunStatusParams,
  CronjobRunStatusResponse,
  CronjobRunLogsResponse,
  CronjobTriggerResponse,
} from '../types.js';
import { serializeStructuredArgs } from '../jsonPayload.js';

/** A Cronjob of /api/v2. */
interface WireCronjob {
  id: AlvaId;
  name: string;
  entryPath: string;
  cronExpression: string;
  status: string;
  argsJson: string | null;
  pushNotify: boolean;
  maxHeapSizeMb: number | null;
  executionTimeoutSeconds: number;
  runAsAccountId: AlvaId | null;
  startsAt: string | null;
  endsAt: string | null;
  maxRuns: number | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A CronjobRun of /api/v2. */
interface WireCronjobRun {
  id: AlvaId;
  cronjobId: AlvaId;
  dispatchId: AlvaId | null;
  status: string;
  error: string | null;
  durationMs: number;
  creditsUsed: string;
  createdAt: string;
  finishedAt: string | null;
}

/** v1's lower-case run statuses. */
const RUN_STATUSES: Record<string, string> = {
  QUEUED: 'dispatched',
  RUNNING: 'running',
  SUCCEEDED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

/** v1's dispatch states. */
const DISPATCH_STATES: Record<string, string> = {
  PENDING: 'PENDING',
  QUEUED: 'DISPATCHED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'COMPLETED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
};

/** `run_as_user_id` "0" runs the cronjob as its owner. */
const RUN_AS_OWNER = '0';

/** v1's home-relative path: /alva/home/<username>/a/b is /a/b. */
function homeRelative(path: string, username: string): string {
  const home = `/alva/home/${username}/`;
  return path.startsWith(home) ? `/${path.slice(home.length)}` : path;
}

function args(argsJson: string | null): Cronjob['args'] {
  if (!argsJson) return null;
  try {
    return JSON.parse(argsJson) as Record<string, unknown>;
  } catch {
    return argsJson;
  }
}

function cronjob(job: WireCronjob, username: string): Cronjob {
  return {
    id: job.id,
    name: job.name,
    path: homeRelative(job.entryPath, username),
    cron_expression: job.cronExpression,
    status: job.status.toLowerCase(),
    args: args(job.argsJson),
    push_notify: job.pushNotify,
    max_heap_size_mb: job.maxHeapSizeMb,
    execution_timeout_seconds: job.executionTimeoutSeconds,
    run_as_user_id: job.runAsAccountId ?? RUN_AS_OWNER,
    start_at: job.startsAt,
    end_at: job.endsAt,
    max_runs: job.maxRuns,
    run_count: job.runCount,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  };
}

function cronjobRun(run: WireCronjobRun): CronjobRun {
  return {
    id: run.id,
    cronjob_id: run.cronjobId,
    status: RUN_STATUSES[run.status] ?? run.status.toLowerCase(),
    error: run.error ?? '',
    duration_ms: run.durationMs,
    credits_used: Number(run.creditsUsed),
    created_at: run.createdAt,
    ...(run.finishedAt ? { finished_at: run.finishedAt } : {}),
    workflow_run_id: run.dispatchId ?? '',
  };
}

export class DeployResource {
  constructor(private client: AlvaClient) {}

  async create(params: CronjobCreateRequest): Promise<Cronjob> {
    this.client._requireAuth();
    return this.createRequest(
      params,
      params.args === undefined
        ? undefined
        : serializeStructuredArgs(params.args)
    );
  }

  /** @internal Used by the CLI to preserve the exact --args JSON text. */
  async _createSerializedArgs(
    params: CronjobCreateRequest,
    serializedArgs: string
  ): Promise<Cronjob> {
    this.client._requireAuth();
    return this.createRequest(params, serializedArgs);
  }

  private async createRequest(
    params: CronjobCreateRequest,
    argsJson: string | undefined
  ): Promise<Cronjob> {
    const job = await this.client._v2Request<WireCronjob>(
      'POST',
      '/me/cronjobs',
      {
        body: {
          name: params.name,
          entryPath: params.path,
          cronExpression: params.cron_expression,
          argsJson,
          pushNotify: params.push_notify,
          maxHeapSizeMb: params.max_heap_size_mb,
          executionTimeoutSeconds: params.execution_timeout_seconds,
          runAsAccountId: params.run_as_user_id,
          startsAt: params.start_at,
          endsAt: params.end_at,
          maxRuns: params.max_runs,
        },
      }
    );
    return cronjob(job, await this.client.user._username());
  }

  async list(params?: CronjobListParams): Promise<CronjobListResponse> {
    this.client._requireAuth();
    const page = await this.client._v2Request<Page<WireCronjob>>(
      'GET',
      '/me/cronjobs',
      { query: { pageSize: params?.limit, pageToken: params?.cursor } }
    );
    const username = await this.client.user._username();
    return {
      cronjobs: page.items.map((job) => cronjob(job, username)),
      next_cursor: page.nextPageToken ?? '',
    };
  }

  async get(params: { id: AlvaId }): Promise<Cronjob> {
    this.client._requireAuth();
    const job = await this.client._v2Request<WireCronjob>(
      'GET',
      v2Path`/cronjobs/${params.id}`
    );
    return cronjob(job, await this.client.user._username());
  }

  async update(params: CronjobUpdateRequest): Promise<Cronjob> {
    this.client._requireAuth();
    return this.updateRequest(
      params,
      params.args === undefined
        ? undefined
        : serializeStructuredArgs(params.args)
    );
  }

  /** @internal Used by the CLI to preserve the exact --args JSON text. */
  async _updateSerializedArgs(
    params: CronjobUpdateRequest,
    serializedArgs: string
  ): Promise<Cronjob> {
    this.client._requireAuth();
    return this.updateRequest(params, serializedArgs);
  }

  private async updateRequest(
    params: CronjobUpdateRequest,
    argsJson: string | undefined
  ): Promise<Cronjob> {
    const runAs = params.run_as_user_id;
    const job = await this.client._v2Request<WireCronjob>(
      'PATCH',
      v2Path`/cronjobs/${params.id}`,
      {
        body: {
          name: params.name,
          cronExpression: params.cron_expression,
          argsJson,
          pushNotify: params.push_notify,
          maxHeapSizeMb: params.max_heap_size_mb,
          executionTimeoutSeconds: params.execution_timeout_seconds,
          ...(runAs === RUN_AS_OWNER
            ? { runAsOwner: true }
            : { runAsAccountId: runAs }),
        },
      }
    );
    return cronjob(job, await this.client.user._username());
  }

  async delete(params: { id: AlvaId }): Promise<void> {
    this.client._requireAuth();
    await this.client._v2Request('DELETE', v2Path`/cronjobs/${params.id}`);
  }

  async pause(params: { id: AlvaId }): Promise<void> {
    this.client._requireAuth();
    await this.client._v2Request('POST', v2Path`/cronjobs/${params.id}/pause`);
  }

  async resume(params: { id: AlvaId }): Promise<void> {
    this.client._requireAuth();
    await this.client._v2Request('POST', v2Path`/cronjobs/${params.id}/resume`);
  }

  /**
   * Fire the cronjob workflow once, immediately, bypassing the schedule.
   * This is not a dry run: when publisher push and subscriber alert bindings
   * are enabled, a successful Feed execution may send real notifications.
   * Async — returns the dispatch ID at enqueue as `workflow_run_id`. The
   * run can appear as DISPATCHED/RUNNING before it reaches a terminal
   * status; callers verify completion by polling
   * `getRunStatus({cronjob_id, workflow_run_id})` with their own
   * timeout/deadline.
   *
   * Surfaces backend status as HTTP errors (handled by AlvaClient):
   * - 404 not found / cross-user
   * - 409 cronjob is paused (resume before triggering)
   * - 503 worker workflow handle not yet connected (startup race)
   */
  async trigger(params: { id: AlvaId }): Promise<CronjobTriggerResponse> {
    this.client._requireAuth();
    const receipt = await this.client._v2Request<{ dispatchId: AlvaId }>(
      'POST',
      v2Path`/cronjobs/${params.id}/trigger`
    );
    return { workflow_run_id: receipt.dispatchId };
  }

  async listRuns(
    params: CronjobRunsListParams
  ): Promise<CronjobRunsListResponse> {
    this.client._requireAuth();
    const [page, stats] = await Promise.all([
      this.client._v2Request<Page<WireCronjobRun>>(
        'GET',
        v2Path`/cronjobs/${params.cronjob_id}/runs`,
        { query: { pageSize: params.first, pageToken: params.cursor } }
      ),
      this.client._v2Request<{
        totalRuns: number;
        succeededRuns: number;
        failedRuns: number;
        skippedRuns: number;
        lastRunAt: string | null;
        lastSucceededAt: string | null;
      }>('GET', v2Path`/cronjobs/${params.cronjob_id}/run-stats`),
    ]);
    return {
      runs: page.items.map(cronjobRun),
      stats: {
        total_runs: stats.totalRuns,
        success_count: stats.succeededRuns,
        fail_count: stats.failedRuns,
        skipped_count: stats.skippedRuns,
        ...(stats.lastRunAt ? { last_run_at: stats.lastRunAt } : {}),
        ...(stats.lastSucceededAt
          ? { last_success_at: stats.lastSucceededAt }
          : {}),
      },
      ...(page.nextPageToken ? { next_cursor: page.nextPageToken } : {}),
    };
  }

  /**
   * `workflow_run_id` is the dispatch ID `trigger` returned (or a run's
   * `workflow_run_id`); it names its cronjob, which must be `cronjob_id`.
   */
  async getRunStatus(
    params: CronjobRunStatusParams
  ): Promise<CronjobRunStatusResponse> {
    this.client._requireAuth();
    const dispatch = await this.client._v2Request<{
      id: AlvaId;
      cronjobId: AlvaId;
      state: string;
      run: WireCronjobRun | null;
    }>('GET', v2Path`/cronjob-dispatches/${params.workflow_run_id}`);
    if (dispatch.cronjobId !== params.cronjob_id) {
      throw new AlvaError(
        'NOT_FOUND',
        `dispatch ${params.workflow_run_id} is not a run of cronjob ${params.cronjob_id}`,
        404
      );
    }
    return {
      workflow_run_id: dispatch.id,
      state: DISPATCH_STATES[dispatch.state] ?? dispatch.state,
      ...(dispatch.run ? { run: cronjobRun(dispatch.run) } : {}),
    };
  }

  /** `run_id` is the run's ID, which names its cronjob. */
  async getRunLogs(params: {
    cronjob_id: AlvaId;
    run_id: AlvaId;
  }): Promise<CronjobRunLogsResponse> {
    this.client._requireAuth();
    const logs = await this.client._v2Request<{
      logs: string;
      error: string | null;
    }>('GET', v2Path`/cronjob-runs/${params.run_id}/logs`);
    return { logs: logs.logs, error: logs.error ?? '' };
  }
}
