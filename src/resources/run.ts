import type { AlvaClient } from '../client.js';
import type { RunRequest, RunResponse } from '../types.js';
import {
  objectWithRawJSONField,
  serializeStructuredArgs,
} from '../jsonPayload.js';

// POST /api/v2/runs (alva-gateway pkg/v2/api/runtime).
interface WireRun {
  status: 'SUCCEEDED' | 'FAILED';
  returnValue: string;
  logs: string;
  error: string | null;
  durationMs: number;
  creditsUsed: string;
  subscriptionRequired: boolean;
  entitlementFailure: {
    resource: string;
    category: string;
    requiredTier: string;
  } | null;
}

/** Where a run that needs a higher plan sends the user, as v1 did. */
const UPGRADE_URL = 'https://alva.ai/pricing';

function toRunResponse(r: WireRun): RunResponse {
  const out: RunResponse = {
    result: r.returnValue,
    logs: r.logs,
    stats: { credits_used: Number(r.creditsUsed), duration_ms: r.durationMs },
    status: r.status === 'FAILED' ? 'failed' : 'completed',
    error: r.error,
  };
  if (r.subscriptionRequired) {
    out.reject_reason = 'SUBSCRIPTION_ENTITLEMENT_REQUIRED';
    out.upgrade_url = UPGRADE_URL;
    if (r.entitlementFailure) {
      out.entitlement_failure = {
        resource: r.entitlementFailure.resource,
        category: r.entitlementFailure.category,
        required_tier: r.entitlementFailure.requiredTier,
      };
    }
  }
  return out;
}

export class RunResource {
  constructor(private client: AlvaClient) {}

  async execute(params: RunRequest): Promise<RunResponse> {
    this.client._requireAuth();
    return params.args === undefined
      ? this.request(params)
      : this.request(params, serializeStructuredArgs(params.args));
  }

  /** @internal Used by the CLI to preserve the exact --args JSON text. */
  async _executeSerializedArgs(
    params: RunRequest,
    serializedArgs: string
  ): Promise<RunResponse> {
    this.client._requireAuth();
    return this.request(params, serializedArgs);
  }

  private async request(
    params: RunRequest,
    serializedArgs?: string
  ): Promise<RunResponse> {
    // /api/v2 refuses workingDir with entryPath (v1 dropped it).
    const body = {
      code: params.code,
      entryPath: params.entry_path,
      workingDir: params.code === undefined ? undefined : params.working_dir,
      args: params.args,
      maxHeapSizeMb: params.max_heap_size_mb,
    };
    const run = await this.client._v2Request<WireRun>('POST', '/runs', {
      ...(serializedArgs === undefined
        ? { body }
        : {
            jsonBody: objectWithRawJSONField(body, 'args', serializedArgs),
          }),
      timeoutMs: params.timeout_ms,
    });
    return toRunResponse(run);
  }
}
