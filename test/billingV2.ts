import type { Schema } from '../src/platformApi.js';
import { page } from './marketV2.js';

// /api/v2 fixtures of the billing domain (wallet, credit entries,
// allowances); BILLING_FIXTURES is checked against the contract by
// test/fixturesV2.test.ts.

export const PLAYBOOK = 'playbook_0a1';

export function wallet(): Schema<'Wallet'> {
  return {
    balance: '100',
    todayUsed: '3',
    balances: [
      { kind: 'DAILY', remaining: '60', expiresAt: '2026-06-24T00:00:00.000Z' },
      { kind: 'PACK', remaining: '40', expiresAt: null },
    ],
  };
}

export function creditEntry(
  overrides: Partial<Schema<'CreditEntry'>> = {}
): Schema<'CreditEntry'> {
  return {
    id: 'credit_entry_0a1',
    amount: '-5',
    reason: 'CHAT',
    title: 'Ask',
    grantKind: null,
    sessionId: 'session_0a1',
    playbookId: null,
    automationId: null,
    occurredAt: '2026-06-23T01:00:00.000Z',
    ...overrides,
  };
}

export function allowance(
  overrides: Partial<Schema<'Allowance'>> = {}
): Schema<'Allowance'> {
  return {
    id: 'allowance_0a1',
    playbookId: PLAYBOOK,
    amount: '100',
    used: '25',
    remaining: '75',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    ...overrides,
  };
}

export const BILLING_FIXTURES = [
  ['Wallet', wallet()],
  [
    'CreditEntryList',
    page(
      [
        creditEntry(),
        creditEntry({
          id: 'credit_entry_0a2',
          amount: '200',
          reason: 'DAILY_GRANT',
          grantKind: 'DAILY',
          sessionId: null,
          automationId: 'automation_0a1',
        }),
      ],
      'p2'
    ),
  ],
  ['AllowanceList', page([allowance()])],
] as const;
