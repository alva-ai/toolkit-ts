import type { AlvaClient } from '../client.js';
import type { Schema } from '../platformApi.js';
import {
  objectWithRawJSONField,
  serializeStructuredArgs,
} from '../jsonPayload.js';

export interface RunOptions {
  /** Idempotency-Key of the run: the same key never runs the script twice. */
  idempotencyKey?: string;
  /** Client-side HTTP timeout of each attempt, in milliseconds; not sent. */
  timeoutMs?: number;
}

/** Runs JavaScript in the Jagent runtime (POST /api/v2/runs), synchronously. */
export class RunResource {
  constructor(private client: AlvaClient) {}

  /**
   * Runs code or an ALFS entry path. args is a JSON object sent as is; the
   * run's returnValue is the JSON text of the script's return value.
   */
  async execute(
    request: Schema<'RunRequest'>,
    options: RunOptions = {}
  ): Promise<Schema<'Run'>> {
    this.client._requireAuth();
    return request.args === undefined
      ? this.send(request, undefined, options)
      : this.send(request, serializeStructuredArgs(request.args), options);
  }

  /** @internal Used by the CLI to send the exact --args JSON text. */
  async _executeSerializedArgs(
    request: Omit<Schema<'RunRequest'>, 'args'>,
    serializedArgs: string,
    options: RunOptions = {}
  ): Promise<Schema<'Run'>> {
    this.client._requireAuth();
    return this.send(request, serializedArgs, options);
  }

  private send(
    request: Schema<'RunRequest'>,
    serializedArgs: string | undefined,
    options: RunOptions
  ): Promise<Schema<'Run'>> {
    return this.client._v2Request('POST', '/runs', {
      ...(serializedArgs === undefined
        ? { body: request }
        : {
            jsonBody: objectWithRawJSONField(request, 'args', serializedArgs),
          }),
      idempotencyKey: options.idempotencyKey,
      timeoutMs: options.timeoutMs,
    });
  }
}
