import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { collectAll, v2Path, type Page } from '../platformApi.js';
import type { AlvaId } from '../types.js';

export interface PlaybookFunction {
  id: AlvaId;
  playbook_id: AlvaId;
  function_name: string;
  entry_script_path: string;
  created_at?: string;
  updated_at?: string;
  disabled?: boolean;
  params_schema?: string;
  allow_charges?: boolean;
  /** The Account ID of the service account invocations run as. */
  run_as_user_id?: AlvaId;
}

export interface RegisterFunctionParams {
  playbook_id: AlvaId;
  function_name: string;
  entry_script_path: string;
  params_schema?: string;
  allow_charges?: boolean;
  /**
   * Run invocations of this function under a restricted service-account
   * identity (the Account ID of a service account the caller owns) instead
   * of the owner (#602). Omitted ⇒ keeps the function's current identity.
   */
  run_as_user_id?: AlvaId;
}

export interface RegisterFunctionResponse {
  function?: PlaybookFunction;
}

export interface ListFunctionsParams {
  playbook_id: AlvaId;
}

export interface ListFunctionsResponse {
  functions: PlaybookFunction[];
}

export interface DeleteFunctionParams {
  playbook_id: AlvaId;
  function_name: string;
}

export interface InvokeFunctionParams {
  playbook_id: AlvaId;
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
  id: AlvaId;
  playbook_id: AlvaId;
  amount: number;
  used: number;
  remaining: number;
  created_at_ms?: number;
  updated_at_ms?: number;
}

export interface GetAllowanceParams {
  playbook_id: AlvaId;
}

export interface ListAllowancesResponse {
  allowances: CreditAllowance[];
}

export interface CreateAllowanceParams {
  playbook_id: AlvaId;
  amount: number;
}

export interface CreateAllowanceResponse {
  allowance: CreditAllowance;
}

export interface RevokeAllowanceParams {
  playbook_id: AlvaId;
}

export interface RevokeAllowanceResponse {
  ok: boolean;
}

// The service-function domain on /api/v2 (alva-gateway
// pkg/v2/api/functions): a function is addressed by its own ID, found by
// its Playbook and name; credit amounts are Decimal strings.
interface WireFunction {
  id: AlvaId;
  playbookId: AlvaId;
  name: string;
  entryScriptPath: string;
  paramsSchema: string | null;
  allowCharges: boolean;
  disabled: boolean;
  runAsAccountId: AlvaId | null;
  createdAt: string;
  updatedAt: string;
}

interface WireInvocation {
  resultJson: string;
  logs: string;
  creditsUsedTotal: string;
  creditsChargedOwner: string;
  creditsChargedConsumer: string;
}

interface WireAllowance {
  id: AlvaId;
  playbookId: AlvaId;
  amount: string;
  used: string;
  remaining: string;
  createdAt: string;
  updatedAt: string;
}

function toFunction(fn: WireFunction): PlaybookFunction {
  const out: PlaybookFunction = {
    id: fn.id,
    playbook_id: fn.playbookId,
    function_name: fn.name,
    entry_script_path: fn.entryScriptPath,
    created_at: fn.createdAt,
    updated_at: fn.updatedAt,
    disabled: fn.disabled,
    params_schema: fn.paramsSchema ?? '',
    allow_charges: fn.allowCharges,
  };
  if (fn.runAsAccountId !== null) out.run_as_user_id = fn.runAsAccountId;
  return out;
}

function toAllowance(a: WireAllowance): CreditAllowance {
  return {
    id: a.id,
    playbook_id: a.playbookId,
    amount: Number(a.amount),
    used: Number(a.used),
    remaining: Number(a.remaining),
    created_at_ms: Date.parse(a.createdAt),
    updated_at_ms: Date.parse(a.updatedAt),
  };
}

/**
 * Playbook function management. These functions are registered by a playbook
 * creator and invoked by released playbook UI through the browser UDF runtime.
 */
export class FunctionsResource {
  /** Function IDs by Playbook and name; an ID never changes. */
  private functionIds = new Map<string, Promise<AlvaId>>();

  constructor(private client: AlvaClient) {}

  async register(
    params: RegisterFunctionParams
  ): Promise<RegisterFunctionResponse> {
    this.client._requireAuth();
    // v1 cleared the identity with "0"; /api/v2 takes Account IDs only.
    if (params.run_as_user_id === '0') {
      throw new AlvaError(
        'INVALID_ARGUMENT',
        'clearing run_as_user_id is not available on /api/v2; omit it to keep the current identity',
        400
      );
    }
    const fn = await this.client._v2Request<WireFunction>(
      'POST',
      v2Path`/playbooks/${params.playbook_id}/functions`,
      {
        body: {
          name: params.function_name,
          entryScriptPath: params.entry_script_path,
          paramsSchema: params.params_schema,
          allowCharges: params.allow_charges,
          runAsAccountId: params.run_as_user_id,
        },
      }
    );
    return { function: toFunction(fn) };
  }

  async list(params: ListFunctionsParams): Promise<ListFunctionsResponse> {
    this.client._requireAuth();
    const functions = await collectAll(
      this.client._v2Pages<WireFunction>(
        v2Path`/playbooks/${params.playbook_id}/functions`,
        { pageSize: 100 }
      )
    );
    return { functions: functions.map(toFunction) };
  }

  async delete(params: DeleteFunctionParams): Promise<void> {
    this.client._requireAuth();
    const id = await this.functionId(params.playbook_id, params.function_name);
    await this.client._v2Request('DELETE', v2Path`/functions/${id}`);
  }

  async invoke<TResult = unknown>(
    params: InvokeFunctionParams
  ): Promise<InvokeFunctionResponse<TResult>> {
    this.client._requireAuth();
    const id = await this.functionId(params.playbook_id, params.function_name);
    const r = await this.client._v2Request<WireInvocation>(
      'POST',
      v2Path`/functions/${id}/invocations`,
      { body: { parametersJson: JSON.stringify(params.parameters ?? {}) } }
    );
    return {
      result: parseResultPayload<TResult>(r.resultJson),
      logs: r.logs,
      credits_used_total: Number(r.creditsUsedTotal),
      credits_charged_owner: Number(r.creditsChargedOwner),
      credits_charged_consumer: Number(r.creditsChargedConsumer),
    };
  }

  async getAllowance(
    params: GetAllowanceParams
  ): Promise<CreditAllowance | null> {
    this.client._requireAuth();
    const allowance = await this.allowanceOf(params.playbook_id);
    return allowance === undefined ? null : toAllowance(allowance);
  }

  async listAllowances(): Promise<ListAllowancesResponse> {
    this.client._requireAuth();
    const allowances = await collectAll(
      this.client._v2Pages<WireAllowance>('/me/allowances', { pageSize: 100 })
    );
    return { allowances: allowances.map(toAllowance) };
  }

  async createAllowance(
    params: CreateAllowanceParams
  ): Promise<CreateAllowanceResponse> {
    this.client._requireAuth();
    const allowance = await this.client._v2Request<WireAllowance>(
      'POST',
      '/me/allowances',
      {
        body: {
          playbookId: params.playbook_id,
          credits: String(params.amount),
        },
      }
    );
    return { allowance: toAllowance(allowance) };
  }

  async revokeAllowance(
    params: RevokeAllowanceParams
  ): Promise<RevokeAllowanceResponse> {
    this.client._requireAuth();
    const allowance = await this.allowanceOf(params.playbook_id);
    if (allowance !== undefined) {
      await this.client._v2Request(
        'DELETE',
        v2Path`/me/allowances/${allowance.id}`
      );
    }
    return { ok: true };
  }

  /** The caller's allowance on a Playbook, if any. */
  private async allowanceOf(
    playbookId: AlvaId
  ): Promise<WireAllowance | undefined> {
    const page = await this.client._v2Request<Page<WireAllowance>>(
      'GET',
      '/me/allowances',
      { query: { playbookId } }
    );
    return page.items[0];
  }

  /** The ID of a Playbook's function, looked up by name once. */
  private functionId(playbookId: AlvaId, name: string): Promise<AlvaId> {
    const key = JSON.stringify([playbookId, name]);
    let id = this.functionIds.get(key);
    if (id === undefined) {
      id = this.client
        ._v2Request<
          Page<WireFunction>
        >('GET', v2Path`/playbooks/${playbookId}/functions`, { query: { name } })
        .then((page) => {
          const fn = page.items[0];
          if (fn === undefined) {
            throw new AlvaError(
              'NOT_FOUND',
              `Playbook ${playbookId} has no function named ${name}`,
              404
            );
          }
          return fn.id;
        });
      id.catch(() => this.functionIds.delete(key));
      this.functionIds.set(key, id);
    }
    return id;
  }
}

function parseResultPayload<TResult>(result: unknown): TResult {
  if (typeof result !== 'string') return result as TResult;
  try {
    return JSON.parse(result) as TResult;
  } catch {
    return result as TResult;
  }
}
