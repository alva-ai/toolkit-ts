import type { AlvaClient } from '../client.js';
import type { RunRequest, RunResponse } from '../types.js';

export class RunResource {
  constructor(private client: AlvaClient) {}

  async execute(params: RunRequest): Promise<RunResponse> {
    this.client._requireAuth();
    return this.client._request('POST', '/api/v1/run', {
      body: {
        code: params.code,
        entry_path: params.entry_path,
        working_dir: params.working_dir,
        args: params.args,
      },
    }) as Promise<RunResponse>;
  }
}
