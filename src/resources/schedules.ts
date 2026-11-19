import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { collectAll, v2Path, type Page } from '../platformApi.js';
import type { AlvaId } from '../types.js';

export type AgentScheduleStatus = 'active' | 'paused' | 'completed' | 'failed';

export type AgentScheduleFailureCode =
  | 'target_invalid'
  | 'delivery_exhausted'
  | 'payload_conflict';

export type AgentScheduleRule =
  | { kind: 'at'; timestamp: string }
  | { kind: 'every'; interval: string }
  | { kind: 'cron'; expression: string; timezone: string };

export interface AgentScheduleBounds {
  startsAt?: string;
  until?: string;
  maxOccurrences?: number;
}

export interface AgentSchedule {
  name: string;
  rule: AgentScheduleRule;
  bounds: AgentScheduleBounds;
  text: string;
  status: AgentScheduleStatus;
  failure?: { code: AgentScheduleFailureCode; at?: string };
  occurrencesUsed: number;
  nextFireAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type AgentScheduleTarget =
  | { channelId: AlvaId; inboxPath?: never }
  | { inboxPath: string; channelId?: never };

export type PutAgentScheduleParams = AgentScheduleTarget & {
  name: string;
  rule: AgentScheduleRule | { kind: 'after'; duration: string };
  bounds?: AgentScheduleBounds;
  text: string;
};

export type ManageAgentScheduleParams = AgentScheduleTarget & {
  name: string;
};

const SCHEDULE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-](\d{2}):(\d{2}))$/i;
// Digest windows carry millisecond precision; schedule semantics stay second-based.
const RFC3339_FRACTIONAL =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/i;
const ISO_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/** A Schedule or SessionSchedule of /api/v2. */
interface WireSchedule {
  id: AlvaId;
  name: string;
  rule: {
    kind: 'AT' | 'EVERY' | 'CRON';
    fireAt: string | null;
    everySeconds: number | null;
    cron: string | null;
    timezone: string | null;
  };
  startsAt: string | null;
  endsAt: string | null;
  maxOccurrences: number | null;
  message: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'FAILED';
  failureCode:
    | 'TARGET_INVALID'
    | 'DELIVERY_EXHAUSTED'
    | 'PAYLOAD_CONFLICT'
    | null;
  failedAt: string | null;
  occurrencesUsed: number;
  nextFireAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type Target = { channelId: AlvaId } | { inboxPath: string };

export class SchedulesResource {
  constructor(private client: AlvaClient) {}

  async list(params: AgentScheduleTarget): Promise<AgentSchedule[]> {
    this.client._requireAuth();
    const target = targetInput(params);
    const schedules = await collectAll(
      'channelId' in target
        ? this.client._v2Pages<WireSchedule>(
            v2Path`/channels/${target.channelId}/schedules`,
            { pageSize: 100 }
          )
        : this.client._v2Pages<WireSchedule>('/session-schedules', {
            query: { inboxPath: target.inboxPath },
            pageSize: 100,
          })
    );
    return schedules.map(fromWireSchedule);
  }

  async put(params: PutAgentScheduleParams): Promise<AgentSchedule> {
    this.client._requireAuth();
    const target = targetInput(params);
    const body = {
      name: requireName(params.name),
      ...ruleInput(params.rule, params.bounds),
      message: requireText(params.text),
    };
    const schedule =
      'channelId' in target
        ? await this.client._v2Request<WireSchedule>(
            'POST',
            v2Path`/channels/${target.channelId}/schedules`,
            { body }
          )
        : await this.client._v2Request<WireSchedule>(
            'POST',
            '/session-schedules',
            { body: { inboxPath: target.inboxPath, ...body } }
          );
    return fromWireSchedule(schedule);
  }

  pause(params: ManageAgentScheduleParams): Promise<AgentSchedule> {
    return this.manage('pause', params);
  }

  resume(params: ManageAgentScheduleParams): Promise<AgentSchedule> {
    return this.manage('resume', params);
  }

  async delete(params: ManageAgentScheduleParams): Promise<void> {
    this.client._requireAuth();
    await this.client._v2Request('DELETE', await this.schedulePath(params));
  }

  /** Resolve the authenticated viewer's unique Agent Channel for CLI defaults. */
  async agentChannelId(): Promise<AlvaId> {
    this.client._requireAuth();
    const page = await this.client._v2Request<Page<{ id: AlvaId }>>(
      'GET',
      '/me/channels',
      { query: { kind: 'AGENT' } }
    );
    const id = page.items[0]?.id;
    if (!id) throw scheduleNotFound();
    return id;
  }

  private async manage(
    action: 'pause' | 'resume',
    params: ManageAgentScheduleParams
  ): Promise<AgentSchedule> {
    this.client._requireAuth();
    const path = await this.schedulePath(params);
    return fromWireSchedule(
      await this.client._v2Request<WireSchedule>('POST', `${path}/${action}`)
    );
  }

  /** The path of the schedule a target and name select. */
  private async schedulePath(
    params: ManageAgentScheduleParams
  ): Promise<string> {
    const target = targetInput(params);
    const name = requireName(params.name);
    const page =
      'channelId' in target
        ? await this.client._v2Request<Page<WireSchedule>>(
            'GET',
            v2Path`/channels/${target.channelId}/schedules`,
            { query: { name } }
          )
        : await this.client._v2Request<Page<WireSchedule>>(
            'GET',
            '/session-schedules',
            { query: { inboxPath: target.inboxPath, name } }
          );
    const id = page.items[0]?.id;
    if (!id)
      throw new AlvaError('NOT_FOUND', `schedule ${name} not found`, 404);
    return 'channelId' in target
      ? v2Path`/schedules/${id}`
      : v2Path`/session-schedules/${id}`;
  }
}

/** The rule and bounds of a POST body. */
function ruleInput(
  rule: PutAgentScheduleParams['rule'],
  bounds: AgentScheduleBounds | undefined
): Record<string, unknown> {
  const convertedBounds = boundsInput(bounds);
  switch (rule.kind) {
    case 'after':
      if (convertedBounds)
        throw invalid('after does not accept recurring bounds');
      const requestedAt = Date.now() + durationMilliseconds(rule.duration, 1);
      const atMs = Math.ceil(requestedAt / 1000) * 1000;
      if (!Number.isSafeInteger(atMs) || Number.isNaN(new Date(atMs).getTime()))
        throw invalid('after is out of range');
      return { rule: { kind: 'AT', fireAt: new Date(atMs).toISOString() } };
    case 'at':
      if (convertedBounds) throw invalid('at does not accept recurring bounds');
      return {
        rule: {
          kind: 'AT',
          fireAt: new Date(timestampMilliseconds(rule.timestamp)).toISOString(),
        },
      };
    case 'every':
      return {
        rule: { kind: 'EVERY', everySeconds: durationSeconds(rule.interval) },
        ...convertedBounds,
      };
    case 'cron':
      if (!rule.expression.trim() || !rule.timezone.trim()) {
        throw invalid('cron expression and timezone are required');
      }
      return {
        rule: { kind: 'CRON', cron: rule.expression, timezone: rule.timezone },
        ...convertedBounds,
      };
  }
}

function boundsInput(
  bounds: AgentScheduleBounds | undefined
): Record<string, unknown> | undefined {
  if (!bounds) return undefined;
  const result: Record<string, unknown> = {};
  if (bounds.startsAt !== undefined)
    result.startsAt = new Date(
      timestampMilliseconds(bounds.startsAt)
    ).toISOString();
  if (bounds.until !== undefined)
    result.endsAt = new Date(timestampMilliseconds(bounds.until)).toISOString();
  if (bounds.maxOccurrences !== undefined) {
    if (
      !Number.isSafeInteger(bounds.maxOccurrences) ||
      bounds.maxOccurrences <= 0
    ) {
      throw invalid('maxOccurrences must be a positive safe integer');
    }
    result.maxOccurrences = bounds.maxOccurrences;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function fromWireSchedule(schedule: WireSchedule): AgentSchedule {
  const statuses: Record<WireSchedule['status'], AgentScheduleStatus> = {
    ACTIVE: 'active',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    FAILED: 'failed',
  };
  const status = statuses[schedule.status];
  if (!status) throw scheduleInvalidResponse();
  const result: AgentSchedule = {
    name: schedule.name,
    rule: fromWireRule(schedule.rule),
    bounds: {
      ...(schedule.startsAt != null
        ? { startsAt: instant(schedule.startsAt, true) }
        : {}),
      ...(schedule.endsAt != null
        ? { until: instant(schedule.endsAt, true) }
        : {}),
      ...(schedule.maxOccurrences != null
        ? {
            maxOccurrences: safeInteger(
              schedule.maxOccurrences,
              'maxOccurrences'
            ),
          }
        : {}),
    },
    text: schedule.message ?? '',
    status,
    occurrencesUsed: safeInteger(schedule.occurrencesUsed, 'occurrencesUsed'),
    ...(schedule.nextFireAt != null
      ? { nextFireAt: instant(schedule.nextFireAt, true) }
      : {}),
    createdAt: instant(schedule.createdAt),
    updatedAt: instant(schedule.updatedAt),
  };
  if (status === 'failed') {
    if (!schedule.failureCode) throw scheduleInvalidResponse();
    const failureCodes: Record<
      NonNullable<WireSchedule['failureCode']>,
      AgentScheduleFailureCode
    > = {
      TARGET_INVALID: 'target_invalid',
      DELIVERY_EXHAUSTED: 'delivery_exhausted',
      PAYLOAD_CONFLICT: 'payload_conflict',
    };
    const code = failureCodes[schedule.failureCode];
    if (!code) throw scheduleInvalidResponse();
    result.failure = {
      code,
      ...(schedule.failedAt != null ? { at: instant(schedule.failedAt) } : {}),
    };
  }
  return result;
}

function fromWireRule(rule: WireSchedule['rule']): AgentScheduleRule {
  switch (rule.kind) {
    case 'AT':
      if (rule.fireAt == null) throw scheduleInvalidResponse();
      return { kind: 'at', timestamp: instant(rule.fireAt, true) };
    case 'EVERY':
      if (rule.everySeconds == null) throw scheduleInvalidResponse();
      return {
        kind: 'every',
        interval: `PT${safeInteger(rule.everySeconds, 'interval')}S`,
      };
    case 'CRON':
      if (!rule.cron || !rule.timezone) throw scheduleInvalidResponse();
      return { kind: 'cron', expression: rule.cron, timezone: rule.timezone };
  }
  throw scheduleInvalidResponse();
}

function targetInput(target: AgentScheduleTarget): Target {
  if ((target.channelId !== undefined) === (target.inboxPath !== undefined))
    throw invalid('exactly one of channelId or inboxPath is required');
  if (target.channelId !== undefined)
    return { channelId: channelID(target.channelId) };
  const path = target.inboxPath;
  const size = typeof path === 'string' ? utf8Size(path) : undefined;
  if (
    typeof path !== 'string' ||
    size === undefined ||
    size > 2048 ||
    !path.startsWith('/') ||
    path.includes('\0') ||
    path
      .slice(1)
      .split('/')
      .some((segment) => segment === '' || segment === '.' || segment === '..')
  )
    throw invalid('inboxPath must be a canonical absolute ALFS Inbox path');
  const transcript = path.endsWith('.inbox.jsonl')
    ? path.slice(0, -'.inbox.jsonl'.length) + '.jsonl'
    : path.endsWith('.inbox') && !path.endsWith('.jsonl.inbox')
      ? path.slice(0, -'.inbox'.length)
      : undefined;
  if (
    transcript === undefined ||
    /\.inbox(?:\.jsonl)?$/.test(transcript) ||
    /\.lock(?:\.recovery|\.heartbeat-[^/]+|\.stale-[^/]+)?$/.test(transcript) ||
    transcript.endsWith('/.jsonl')
  )
    throw invalid('inboxPath must identify a standard Session Inbox sidecar');
  return { inboxPath: path };
}

function channelID(value: AlvaId): AlvaId {
  if (typeof value !== 'string' || !value.trim())
    throw invalid('channelId must be a channel id');
  return value;
}

function requireName(value: string): string {
  if (!SCHEDULE_NAME.test(value))
    throw invalid(
      'name must be 1-63 lowercase alphanumeric characters or hyphens'
    );
  return value;
}

function requireText(value: string): string {
  const size = utf8Size(value);
  if (size === undefined || !value.trim() || size > 16 * 1024)
    throw invalid('text must be 1..16384 UTF-8 bytes');
  return value;
}

function durationSeconds(value: string): number {
  const milliseconds = durationMilliseconds(value, 60);
  if (milliseconds % 1000 !== 0)
    throw invalid('duration must resolve to whole seconds');
  return milliseconds / 1000;
}

function durationMilliseconds(value: string, minimumSeconds: number): number {
  const match = ISO_DURATION.exec(value);
  if (
    !match ||
    match.slice(1, 5).every((part) => part === undefined) ||
    (value.includes('T') &&
      match.slice(2, 5).every((part) => part === undefined))
  ) {
    throw invalid('duration must be a positive ISO 8601 day/time duration');
  }
  const [days, hours, minutes, seconds] = match
    .slice(1, 5)
    .map((part) => BigInt(part ?? '0'));
  const totalSeconds = ((days * 24n + hours) * 60n + minutes) * 60n + seconds;
  if (totalSeconds < BigInt(minimumSeconds)) {
    throw invalid(`duration must be at least ${minimumSeconds} whole seconds`);
  }
  const result = Number(totalSeconds * 1000n);
  if (!Number.isSafeInteger(result)) throw invalid('duration is out of range');
  return result;
}

/** Strict RFC 3339 (with timezone) → epoch milliseconds; throws INVALID_ARGUMENT otherwise. */
export function parseRfc3339Milliseconds(value: string): number {
  return timestampMilliseconds(value, true);
}

function timestampMilliseconds(value: string, fractional = false): number {
  const match = (fractional ? RFC3339_FRACTIONAL : RFC3339).exec(value);
  if (!match) throw invalid('timestamp must be RFC3339 with a timezone');
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map(Number);
  const offsetHour = Number(match[8] ?? 0);
  const offsetMinute = Number(match[9] ?? 0);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const result = Date.parse(value);
  if (
    !Number.isFinite(result) ||
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    throw invalid('timestamp must be RFC3339 with a timezone');
  }
  return result;
}

/** An RFC 3339 instant of the server, normalized; semantic instants are whole seconds. */
function instant(value: string, semantic = false): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || (semantic && ms % 1000 !== 0))
    throw scheduleInvalidResponse();
  return new Date(ms).toISOString();
}

function safeInteger(value: number | string, field: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0)
    throw invalid(`${field} exceeds JavaScript safe integer range`);
  return result;
}

function invalid(message: string): AlvaError {
  return new AlvaError('INVALID_ARGUMENT', message, 400);
}

function utf8Size(value: string): number | undefined {
  const bytes = new TextEncoder().encode(value);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes) === value
    ? bytes.byteLength
    : undefined;
}

function scheduleNotFound(): AlvaError {
  return new AlvaError('NOT_FOUND', 'channel schedule target not found', 404);
}

function scheduleInvalidResponse(): AlvaError {
  return new AlvaError(
    'INVALID_RESPONSE',
    'the server returned an invalid schedule',
    502
  );
}
