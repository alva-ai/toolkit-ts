import type { AlvaClient } from '../client.js';

export interface PlaybookFunction {
  id: string | number;
  playbook_id: string | number;
  function_name: string;
  entry_script_path: string;
  created_at?: string;
  updated_at?: string;
  disabled?: boolean;
  params_schema?: string;
  allow_charges?: boolean;
}

export interface RegisterFunctionParams {
  playbook_id: number;
  function_name: string;
  entry_script_path: string;
  params_schema?: string;
  allow_charges?: boolean;
  /**
   * Run invocations of this function under a restricted service-account
   * identity (an SA id owned by the caller) instead of the owner (#602).
   * Omitted ⇒ runs as the owner. A string: SA ids are snowflake int64s that
   * overflow JS number precision.
   */
  run_as_user_id?: string;
}

export interface RegisterFunctionResponse {
  function?: PlaybookFunction;
}

export interface ListFunctionsParams {
  playbook_id: number;
}

export interface ListFunctionsResponse {
  functions: PlaybookFunction[];
}

export interface DeleteFunctionParams {
  playbook_id: number;
  function_name: string;
}

export interface InvokeFunctionParams {
  playbook_id: number;
  function_name: string;
  parameters?: unknown;
}

export interface InvokeFunctionResponse<TResult = unknown> {
  result: TResult;
  logs: string;
  credits_used_total: number;
  credits_charged_owner: number;
  credits_charged_consumer: number;
}

export interface CreditAllowance {
  id: string | number;
  consumer_uid: string | number;
  playbook_id: string | number;
  amount: number;
  used: number;
  remaining: number;
  created_at_ms?: number;
  updated_at_ms?: number;
}

export interface GetAllowanceParams {
  playbook_id: number;
}

export interface ListAllowancesResponse {
  allowances: CreditAllowance[];
}

export interface CreateAllowanceParams {
  playbook_id: number;
  amount: number;
}

export interface CreateAllowanceResponse {
  allowance: CreditAllowance;
}

export interface RevokeAllowanceParams {
  playbook_id: number;
}

export interface RevokeAllowanceResponse {
  ok: boolean;
}

interface RawCreditAllowance {
  id?: string | number;
  consumer_uid?: string | number;
  consumerUid?: string | number;
  playbook_id?: string | number;
  playbookId?: string | number;
  amount?: number;
  used?: number;
  remaining?: number;
  created_at?: unknown;
  createdAt?: unknown;
  created_at_ms?: number;
  createdAtMs?: number;
  updated_at?: unknown;
  updatedAt?: unknown;
  updated_at_ms?: number;
  updatedAtMs?: number;
}

interface CreditAllowanceEnvelope {
  allowance?: RawCreditAllowance | null;
}

interface ListAllowancesEnvelope {
  allowances?: RawCreditAllowance[];
}

/**
 * Playbook function management. These functions are registered by a playbook
 * creator and invoked by released playbook UI through the browser UDF runtime.
 */
export class FunctionsResource {
  constructor(private client: AlvaClient) {}

  async register(
    params: RegisterFunctionParams
  ): Promise<RegisterFunctionResponse> {
    this.client._requireAuth();
    return this.client._request('POST', '/api/v1/service/functions', {
      body: {
        playbook_id: params.playbook_id,
        function_name: params.function_name,
        entry_script_path: params.entry_script_path,
        params_schema: params.params_schema,
        allow_charges: params.allow_charges,
        run_as_user_id: params.run_as_user_id,
      },
    }) as Promise<RegisterFunctionResponse>;
  }

  async list(params: ListFunctionsParams): Promise<ListFunctionsResponse> {
    this.client._requireAuth();
    return this.client._request('GET', '/api/v1/service/functions', {
      query: {
        playbook_id: params.playbook_id,
      },
    }) as Promise<ListFunctionsResponse>;
  }

  async delete(params: DeleteFunctionParams): Promise<void> {
    this.client._requireAuth();
    await this.client._request('DELETE', '/api/v1/service/functions', {
      query: {
        playbook_id: params.playbook_id,
        function_name: params.function_name,
      },
    });
  }

  async invoke<TResult = unknown>(
    params: InvokeFunctionParams
  ): Promise<InvokeFunctionResponse<TResult>> {
    this.client._requireAuth();
    const response = (await this.client._request(
      'POST',
      '/api/v1/service/invoke',
      {
        body: {
          playbook_id: params.playbook_id,
          function_name: params.function_name,
          parameters_json: JSON.stringify(params.parameters ?? {}),
        },
      }
    )) as InvokeFunctionResponse<unknown>;
    return {
      ...response,
      result: parseResultPayload<TResult>(response.result),
    };
  }

  async getAllowance(
    params: GetAllowanceParams
  ): Promise<CreditAllowance | null> {
    this.client._requireAuth();
    const response = (await this.client._request(
      'GET',
      '/api/v1/service/allowance',
      {
        query: {
          playbook_id: params.playbook_id,
        },
      }
    )) as CreditAllowanceEnvelope;
    return normalizeAllowance(response.allowance);
  }

  async listAllowances(): Promise<ListAllowancesResponse> {
    this.client._requireAuth();
    const response = (await this.client._request(
      'GET',
      '/api/v1/service/allowances'
    )) as ListAllowancesEnvelope;
    return {
      allowances: (response.allowances ?? [])
        .map((allowance) => normalizeAllowance(allowance))
        .filter(
          (allowance): allowance is CreditAllowance => allowance !== null
        ),
    };
  }

  async createAllowance(
    params: CreateAllowanceParams
  ): Promise<CreateAllowanceResponse> {
    this.client._requireAuth();
    const response = (await this.client._request(
      'POST',
      '/api/v1/service/allowance',
      {
        body: {
          playbook_id: params.playbook_id,
          amount: params.amount,
        },
      }
    )) as CreditAllowanceEnvelope;
    return { allowance: requireAllowance(response.allowance) };
  }

  async revokeAllowance(
    params: RevokeAllowanceParams
  ): Promise<RevokeAllowanceResponse> {
    this.client._requireAuth();
    await this.client._request('DELETE', '/api/v1/service/allowance', {
      query: {
        playbook_id: params.playbook_id,
      },
    });
    return { ok: true };
  }
}

function normalizeAllowance(raw: RawCreditAllowance | null | undefined) {
  if (!raw) return null;
  const allowance: CreditAllowance = {
    id: raw.id ?? '',
    consumer_uid: raw.consumer_uid ?? raw.consumerUid ?? '',
    playbook_id: raw.playbook_id ?? raw.playbookId ?? '',
    amount: raw.amount ?? 0,
    used: raw.used ?? 0,
    remaining: raw.remaining ?? 0,
  };
  const createdAtMs = timestampMs(
    raw.created_at_ms ?? raw.createdAtMs ?? raw.created_at ?? raw.createdAt
  );
  const updatedAtMs = timestampMs(
    raw.updated_at_ms ?? raw.updatedAtMs ?? raw.updated_at ?? raw.updatedAt
  );
  if (createdAtMs !== undefined) allowance.created_at_ms = createdAtMs;
  if (updatedAtMs !== undefined) allowance.updated_at_ms = updatedAtMs;
  return allowance;
}

function requireAllowance(raw: RawCreditAllowance | null | undefined) {
  const allowance = normalizeAllowance(raw);
  if (!allowance) {
    throw new Error('allowance response missing allowance');
  }
  return allowance;
}

function timestampMs(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  if (typeof value !== 'object') return undefined;
  const ts = value as { seconds?: unknown; nanos?: unknown };
  const seconds =
    typeof ts.seconds === 'number'
      ? ts.seconds
      : typeof ts.seconds === 'string'
        ? Number(ts.seconds)
        : undefined;
  const nanos =
    typeof ts.nanos === 'number'
      ? ts.nanos
      : typeof ts.nanos === 'string'
        ? Number(ts.nanos)
        : 0;
  if (seconds === undefined || !Number.isFinite(seconds)) return undefined;
  return (
    seconds * 1000 + Math.floor((Number.isFinite(nanos) ? nanos : 0) / 1e6)
  );
}

function parseResultPayload<TResult>(result: unknown): TResult {
  if (typeof result !== 'string') return result as TResult;
  try {
    return JSON.parse(result) as TResult;
  } catch {
    return result as TResult;
  }
}
