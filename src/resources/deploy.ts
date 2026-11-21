import type { AlvaClient } from '../client.js';
import { v2Path, type Schema, type V2Query } from '../platformApi.js';

export interface CronjobWriteOptions {
  /** Idempotency-Key of the write; a new UUID when omitted. */
  idempotencyKey?: string;
}

/**
 * Cronjobs: scripts that run on a schedule (the producers of automations).
 * `argsJson` is the JSON text of the script's arguments, kept as written.
 */
export class DeployResource {
  constructor(private client: AlvaClient) {}

  async create(
    body: Schema<'CreateCronjobBody'>,
    options: CronjobWriteOptions = {}
  ): Promise<Schema<'Cronjob'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/me/cronjobs', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** One page of the caller's cronjobs. */
  async list(
    query: V2Query<'/me/cronjobs', 'get'> = {}
  ): Promise<Schema<'CronjobList'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/cronjobs', { query });
  }

  async get(cronjobId: string): Promise<Schema<'Cronjob'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', v2Path`/cronjobs/${cronjobId}`);
  }

  /**
   * A merge patch: absent members are unchanged; `runAsAccountId: null`
   * runs the cronjob as its owner again.
   */
  async update(
    cronjobId: string,
    patch: Schema<'UpdateCronjobBody'>,
    options: CronjobWriteOptions = {}
  ): Promise<Schema<'Cronjob'>> {
    this.client._requireAuth();
    return this.client._v2Request('PATCH', v2Path`/cronjobs/${cronjobId}`, {
      body: patch,
      idempotencyKey: options.idempotencyKey,
    });
  }

  async delete(cronjobId: string): Promise<Record<string, never>> {
    this.client._requireAuth();
    return this.client._v2Request('DELETE', v2Path`/cronjobs/${cronjobId}`);
  }

  async pause(cronjobId: string): Promise<Schema<'Cronjob'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', v2Path`/cronjobs/${cronjobId}/pause`);
  }

  async resume(cronjobId: string): Promise<Schema<'Cronjob'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'POST',
      v2Path`/cronjobs/${cronjobId}/resume`
    );
  }

  /**
   * Fires the cronjob once, now, outside its schedule. This is not a dry
   * run: a Feed execution may send real notifications. Returns the dispatch
   * at enqueue; poll `getDispatch(dispatchId)` until its run is terminal.
   * A paused cronjob is CONFLICT (resume it first).
   */
  async trigger(
    cronjobId: string,
    options: CronjobWriteOptions = {}
  ): Promise<Schema<'DispatchReceipt'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'POST',
      v2Path`/cronjobs/${cronjobId}/trigger`,
      { idempotencyKey: options.idempotencyKey }
    );
  }

  /** One page of a cronjob's runs, newest first. */
  async listRuns(
    cronjobId: string,
    query: V2Query<'/cronjobs/{cronjobId}/runs', 'get'> = {}
  ): Promise<Schema<'CronjobRunList'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', v2Path`/cronjobs/${cronjobId}/runs`, {
      query,
    });
  }

  async runStats(cronjobId: string): Promise<Schema<'CronjobRunStats'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'GET',
      v2Path`/cronjobs/${cronjobId}/run-stats`
    );
  }

  /** A dispatch `trigger` returned, with its run once one started. */
  async getDispatch(
    cronjobDispatchId: string
  ): Promise<Schema<'CronjobDispatch'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'GET',
      v2Path`/cronjob-dispatches/${cronjobDispatchId}`
    );
  }

  async getRunLogs(runId: string): Promise<Schema<'CronjobRunLogs'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', v2Path`/cronjob-runs/${runId}/logs`);
  }
}
