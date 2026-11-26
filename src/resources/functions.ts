import type { AlvaClient } from '../client.js';
import { v2Path, type Schema, type V2Query } from '../platformApi.js';

export interface InvokeFunctionOptions {
  /** Idempotency-Key of the invocation: the same key never runs it twice. */
  idempotencyKey?: string;
}

/**
 * Playbook functions, which a Playbook's creator registers and its released
 * UI invokes, and the credit allowances users give Playbooks. A function is
 * addressed by its own ID; list a Playbook's functions with a name to find
 * one.
 */
export class FunctionsResource {
  constructor(private client: AlvaClient) {}

  /** Registers a function on a Playbook, or replaces the one of that name. */
  async register(
    playbookId: string,
    body: Schema<'RegisterFunctionBody'>
  ): Promise<Schema<'PlaybookFunction'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'POST',
      v2Path`/playbooks/${playbookId}/functions`,
      { body }
    );
  }

  async list(
    playbookId: string,
    query: V2Query<'/playbooks/{playbookId}/functions', 'get'> = {}
  ): Promise<Schema<'PlaybookFunctionList'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'GET',
      v2Path`/playbooks/${playbookId}/functions`,
      { query }
    );
  }

  async delete(functionId: string): Promise<void> {
    this.client._requireAuth();
    await this.client._v2Request('DELETE', v2Path`/functions/${functionId}`);
  }

  /** Runs a function; the caller pays what it charges the consumer. */
  async invoke(
    functionId: string,
    body: Schema<'InvokeFunctionBody'> = {},
    options: InvokeFunctionOptions = {}
  ): Promise<Schema<'FunctionInvocation'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'POST',
      v2Path`/functions/${functionId}/invocations`,
      { body, idempotencyKey: options.idempotencyKey }
    );
  }

  /** The caller's allowance on a Playbook, or null when it has none. */
  async getAllowance(playbookId: string): Promise<Schema<'Allowance'> | null> {
    const page = await this.listAllowances({ playbookId });
    return page.items[0] ?? null;
  }

  async listAllowances(
    query: V2Query<'/me/allowances', 'get'> = {}
  ): Promise<Schema<'AllowanceList'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/allowances', { query });
  }

  /** Gives a Playbook an allowance of the caller's credits (a whole number). */
  async createAllowance(
    body: Schema<'SetAllowanceBody'>
  ): Promise<Schema<'Allowance'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/me/allowances', { body });
  }

  async revokeAllowance(allowanceId: string): Promise<void> {
    this.client._requireAuth();
    await this.client._v2Request(
      'DELETE',
      v2Path`/me/allowances/${allowanceId}`
    );
  }
}
