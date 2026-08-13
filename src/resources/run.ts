import type { AlvaClient } from '../client.js';
import type { RunRequest, RunResponse } from '../types.js';
import {
  objectWithRawJSONField,
  validateStructuredArgs,
} from '../jsonPayload.js';

export class RunResource {
  constructor(private client: AlvaClient) {}

  async execute(params: RunRequest): Promise<RunResponse> {
    this.client._requireAuth();
    validateStructuredArgs(params.args);
    return this.request(params);
  }

  /** @internal Used by the CLI to preserve the exact --args JSON text. */
  async _executeSerializedArgs(
    params: RunRequest,
    serializedArgs: string
  ): Promise<RunResponse> {
    this.client._requireAuth();
    return this.request(params, serializedArgs);
  }

  private request(
    params: RunRequest,
    serializedArgs?: string
  ): Promise<RunResponse> {
    const body = {
      code: params.code,
      entry_path: params.entry_path,
      working_dir: params.working_dir,
      args: params.args,
      max_heap_size_mb: params.max_heap_size_mb,
    };
    return this.client._request('POST', '/api/v1/run', {
      ...(serializedArgs === undefined
        ? { body }
        : {
            jsonBody: objectWithRawJSONField(body, 'args', serializedArgs),
          }),
      timeoutMs: params.timeout_ms,
    }) as Promise<RunResponse>;
  }
}
