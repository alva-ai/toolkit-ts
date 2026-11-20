import type { Schema } from '../src/platformApi.js';
import { PLAYBOOK } from './billingV2.js';
import { page } from './marketV2.js';

// /api/v2 fixtures of the runtime and functions domains (runs, the
// data-skills token, Playbook functions and their invocations);
// RUNTIME_FIXTURES is checked against the contract by
// test/fixturesV2.test.ts.

export const FUNCTION = 'playbook_function_0a1';

export function run(overrides: Partial<Schema<'Run'>> = {}): Schema<'Run'> {
  return {
    status: 'SUCCEEDED',
    returnValue: '{"rows":[1,2]}',
    logs: 'log line',
    error: null,
    durationMs: 7,
    creditsUsed: '0.5',
    subscriptionRequired: false,
    entitlementFailure: null,
    ...overrides,
  };
}

export function dataSkillsToken(
  overrides: Partial<Schema<'DataSkillsToken'>> = {}
): Schema<'DataSkillsToken'> {
  return {
    exists: true,
    expiresAt: '2026-12-01T00:00:00.000Z',
    tier: 'PRO',
    renewalNeeded: false,
    ...overrides,
  };
}

export function dataSkillsTokenRefresh(
  overrides: Partial<Schema<'DataSkillsTokenRefresh'>> = {}
): Schema<'DataSkillsTokenRefresh'> {
  return {
    expiresAt: '2026-12-01T00:00:00.000Z',
    tier: 'PRO',
    renewed: true,
    ...overrides,
  };
}

export function playbookFunction(
  overrides: Partial<Schema<'PlaybookFunction'>> = {}
): Schema<'PlaybookFunction'> {
  return {
    id: FUNCTION,
    playbookId: PLAYBOOK,
    name: 'quote',
    entryScriptPath: '~/fn/quote.js',
    paramsSchema: null,
    allowCharges: false,
    disabled: false,
    runAsAccountId: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    ...overrides,
  };
}

export function functionInvocation(): Schema<'FunctionInvocation'> {
  return {
    resultJson: '{"price":1}',
    logs: 'ok',
    creditsUsedTotal: '3',
    creditsChargedOwner: '1',
    creditsChargedConsumer: '2',
  };
}

export const RUNTIME_FIXTURES = [
  ['Run', run()],
  [
    'Run',
    run({
      status: 'FAILED',
      returnValue: 'null',
      error: 'needs Pro',
      subscriptionRequired: true,
      entitlementFailure: {
        resource: 'data',
        category: 'premium',
        requiredTier: 'PRO',
      },
    }),
  ],
  ['DataSkillsToken', dataSkillsToken()],
  [
    'DataSkillsToken',
    dataSkillsToken({ exists: false, expiresAt: null, tier: null }),
  ],
  ['DataSkillsTokenRefresh', dataSkillsTokenRefresh()],
  [
    'PlaybookFunctionList',
    page([playbookFunction({ runAsAccountId: 'account_0a1' })]),
  ],
  ['FunctionInvocation', functionInvocation()],
] as const;
