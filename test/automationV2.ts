import type { Schema } from '../src/platformApi.js';
import { v2 } from './v2Schema.js';

// /api/v2 fixtures of the automation resources (cronjobs, agent schedules,
// automations), each checked against its schema in the contract.

export const CRONJOB = 'cronjob_0c';
export const AUTOMATION = 'automation_0abc';
export const CHANNEL = 'channel_0ch';
export const INBOX = '/alva/home/alice/original.inbox.jsonl';

export function aCronjob(
  overrides: Partial<Schema<'Cronjob'>> = {}
): Schema<'Cronjob'> {
  return v2('Cronjob', {
    id: CRONJOB,
    name: 'btc-ema',
    entryPath: '/alva/home/alice/feeds/btc-ema/v1/src/index.js',
    cronExpression: '0 */4 * * *',
    timezone: 'UTC',
    status: 'ACTIVE',
    argsJson: '{"symbol":"BTC"}',
    pushNotify: true,
    maxHeapSizeMb: null,
    executionTimeoutSeconds: 1800,
    runAsAccountId: null,
    startsAt: null,
    endsAt: null,
    maxRuns: null,
    runCount: 3,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-02T00:00:00Z',
    ...overrides,
  });
}

export function aCronjobRun(
  overrides: Partial<Schema<'CronjobRun'>> = {}
): Schema<'CronjobRun'> {
  return v2('CronjobRun', {
    id: 'run_0r',
    cronjobId: CRONJOB,
    dispatchId: 'cronjob_dispatch_0d',
    status: 'SUCCEEDED',
    error: null,
    durationMs: 1200,
    creditsUsed: '0.5',
    createdAt: '2026-11-02T00:00:00Z',
    finishedAt: '2026-11-02T00:00:01Z',
    ...overrides,
  });
}

export function aSchedule(
  overrides: Partial<Schema<'Schedule'>> = {}
): Schema<'Schedule'> {
  return v2('Schedule', {
    id: 'schedule_0s',
    channelId: CHANNEL,
    name: 'heartbeat',
    rule: {
      kind: 'EVERY',
      fireAt: null,
      everySeconds: 3600,
      cron: null,
      timezone: null,
    },
    startsAt: null,
    endsAt: null,
    maxOccurrences: null,
    message: 'check',
    status: 'ACTIVE',
    failureCode: null,
    failedAt: null,
    occurrencesUsed: 0,
    nextFireAt: '2026-08-11T05:00:00Z',
    createdAt: '2026-08-11T04:00:00Z',
    updatedAt: '2026-08-11T04:00:00Z',
    ...overrides,
  });
}

export function aSessionSchedule(
  overrides: Partial<Schema<'SessionSchedule'>> = {}
): Schema<'SessionSchedule'> {
  const { channelId, id, ...schedule } = aSchedule();
  void channelId;
  void id;
  return v2('SessionSchedule', {
    ...schedule,
    id: 'session_schedule_0s',
    inboxPath: INBOX,
    ...overrides,
  });
}

export function anAutomation(
  overrides: Partial<Schema<'Automation'>> = {}
): Schema<'Automation'> {
  return v2('Automation', {
    id: AUTOMATION,
    name: 'portfolio-watch',
    description: null,
    status: 'ACTIVE',
    schedule: { cron: '0 9 * * *', timezone: 'UTC' },
    stats: {
      totalRuns: 5,
      succeededRuns: 5,
      failedRuns: 0,
      lastRunAt: null,
      lastRunStatus: null,
    },
    cronjobId: 'cronjob_0p420',
    flow: 'portfolio_watch',
    flowConfigPath:
      '/alva/home/alice/memory/profile/portfolio_watch/portfolio-watch.yaml',
    agentType: null,
    sendsAlerts: true,
    ...overrides,
  });
}

export function aDelivery(): Schema<'AutomationDelivery'> {
  return v2('AutomationDelivery', {
    channelIds: [CHANNEL],
    email: { enabled: true, available: true, address: 'a@example.com' },
  });
}
