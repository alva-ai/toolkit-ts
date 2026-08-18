import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';

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

export interface PutAgentScheduleParams {
  channelId: string | number;
  name: string;
  rule: AgentScheduleRule | { kind: 'after'; duration: string };
  bounds?: AgentScheduleBounds;
  text: string;
}

export interface ManageAgentScheduleParams {
  channelId: string | number;
  name: string;
}

const SCHEDULE_FIELDS = `
  id
  channel { id }
  name
  rule { kind atMs everyIntervalSeconds cronExpression cronTimezone }
  bounds { startsAtMs untilMs maxOccurrences }
  message { text }
  status
  failureCode
  failureAtMs
  occurrencesUsed
  nextFireAtMs
  createdAtMs
  updatedAtMs
`;

const LIST_SCHEDULES = `
query ToolkitListAgentSchedules($channelId: ID!, $after: String) {
  viewer { channel(id: $channelId) {
    schedules(input: { first: 64, after: $after }) {
      edges { node { ${SCHEDULE_FIELDS} } }
      pageInfo { hasNextPage endCursor }
    }
  } }
}`.trim();

const UPDATE_SCHEDULE = `
mutation ToolkitUpdateAgentSchedule($input: UpdateChannelScheduleInput!) {
  updateChannelSchedule(input: $input) {
    schedule { ${SCHEDULE_FIELDS} }
    deleted
  }
}`.trim();

const AGENT_CHANNEL = `
query ToolkitAgentChannel {
  viewer { channels { id kind } }
}`.trim();

const SCHEDULE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-](\d{2}):(\d{2}))$/i;
const ISO_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

interface GraphQLErrorPayload {
  message?: unknown;
  [key: string]: unknown;
}

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: GraphQLErrorPayload[];
}

interface WireSchedule {
  id: string;
  channel: { id: string };
  name: string;
  rule: {
    kind: 'AT' | 'EVERY' | 'CRON';
    atMs?: number | null;
    everyIntervalSeconds?: number | string | null;
    cronExpression?: string | null;
    cronTimezone?: string | null;
  };
  bounds?: {
    startsAtMs?: number | null;
    untilMs?: number | null;
    maxOccurrences?: number | string | null;
  } | null;
  message?: { text?: string | null } | null;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'FAILED';
  failureCode?:
    | 'TARGET_INVALID'
    | 'DELIVERY_EXHAUSTED'
    | 'PAYLOAD_CONFLICT'
    | null;
  failureAtMs?: number | null;
  occurrencesUsed: number | string;
  nextFireAtMs?: number | null;
  createdAtMs: number;
  updatedAtMs: number;
}

interface ScheduleConnection {
  edges?: Array<{ node?: WireSchedule | null } | null>;
  pageInfo?: {
    hasNextPage?: boolean;
    endCursor?: string | null;
  } | null;
}

interface ListSchedulesData {
  viewer?: {
    channel?: { schedules?: ScheduleConnection | null } | null;
  } | null;
}

export class SchedulesResource {
  constructor(private client: AlvaClient) {}

  async list(params: { channelId: string | number }): Promise<AgentSchedule[]> {
    this.client._requireAuth();
    const id = channelID(params.channelId);
    const schedules: AgentSchedule[] = [];
    let after: string | null = null;
    const seenCursors = new Set<string>();
    for (;;) {
      const data: ListSchedulesData = await this.graphql<ListSchedulesData>(
        LIST_SCHEDULES,
        { channelId: id, after }
      );
      const connection: ScheduleConnection | null | undefined =
        data.viewer?.channel?.schedules;
      if (!connection?.edges) throw scheduleNotFound();
      for (const edge of connection.edges) {
        if (!edge?.node) throw scheduleEmptyResponse();
        schedules.push(fromWireSchedule(edge.node));
      }
      if (connection.pageInfo?.hasNextPage !== true) return schedules;
      const next: string | null | undefined = connection.pageInfo.endCursor;
      if (!next || seenCursors.has(next)) throw scheduleEmptyResponse();
      seenCursors.add(next);
      after = next;
    }
  }

  async put(params: PutAgentScheduleParams): Promise<AgentSchedule> {
    this.client._requireAuth();
    const input = {
      channelId: channelID(params.channelId),
      name: requireName(params.name),
      definition: {
        ...ruleInput(params.rule, params.bounds),
        message: { text: requireText(params.text) },
      },
    };
    const data = await this.graphql<{
      updateChannelSchedule?: { schedule?: WireSchedule | null } | null;
    }>(UPDATE_SCHEDULE, { input });
    const schedule = data.updateChannelSchedule?.schedule;
    if (!schedule) throw scheduleEmptyResponse();
    return fromWireSchedule(schedule);
  }

  pause(params: ManageAgentScheduleParams): Promise<AgentSchedule> {
    return this.manage('PAUSED', params);
  }

  resume(params: ManageAgentScheduleParams): Promise<AgentSchedule> {
    return this.manage('ACTIVE', params);
  }

  async delete(params: ManageAgentScheduleParams): Promise<void> {
    this.client._requireAuth();
    const data = await this.graphql<{
      updateChannelSchedule?: { deleted?: boolean } | null;
    }>(UPDATE_SCHEDULE, {
      input: { ...managementInput(params), lifecycle: 'REMOVED' },
    });
    if (data.updateChannelSchedule?.deleted !== true)
      throw scheduleEmptyResponse();
  }

  /** Resolve the authenticated viewer's unique Agent Channel for CLI defaults. */
  async agentChannelId(): Promise<string> {
    this.client._requireAuth();
    const data = await this.graphql<{
      viewer?: { channels?: Array<{ id: string; kind: string }> } | null;
    }>(AGENT_CHANNEL);
    const id = data.viewer?.channels?.find(
      (channel) => channel.kind === 'AGENT'
    )?.id;
    if (!id) throw scheduleNotFound();
    return id;
  }

  private async manage(
    lifecycle: 'ACTIVE' | 'PAUSED',
    params: ManageAgentScheduleParams
  ): Promise<AgentSchedule> {
    this.client._requireAuth();
    const data = await this.graphql<{
      updateChannelSchedule?: { schedule?: WireSchedule | null } | null;
    }>(UPDATE_SCHEDULE, {
      input: { ...managementInput(params), lifecycle },
    });
    const schedule = data.updateChannelSchedule?.schedule;
    if (!schedule) throw scheduleEmptyResponse();
    return fromWireSchedule(schedule);
  }

  private async graphql<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const response = (await this.client._request('POST', '/query', {
      body: variables === undefined ? { query } : { query, variables },
    })) as GraphQLResponse<T>;
    if (response.errors?.length) {
      throw new AlvaError(
        'GRAPHQL_ERROR',
        response.errors
          .map((error) => error.message)
          .filter((message): message is string => typeof message === 'string')
          .join('; ') || 'GraphQL request failed',
        400,
        { errors: response.errors }
      );
    }
    if (!response.data) throw scheduleEmptyResponse();
    return response.data;
  }
}

function ruleInput(
  rule: PutAgentScheduleParams['rule'],
  bounds: AgentScheduleBounds | undefined
): { rule: Record<string, unknown>; bounds?: Record<string, unknown> } {
  const convertedBounds = boundsInput(bounds);
  switch (rule.kind) {
    case 'after':
      if (convertedBounds)
        throw invalid('after does not accept recurring bounds');
      const requestedAt = Date.now() + durationMilliseconds(rule.duration, 1);
      const atMs = Math.ceil(requestedAt / 1000) * 1000;
      if (!Number.isSafeInteger(atMs) || Number.isNaN(new Date(atMs).getTime()))
        throw invalid('after is out of range');
      return {
        rule: {
          kind: 'AT',
          atMs,
        },
      };
    case 'at':
      if (convertedBounds) throw invalid('at does not accept recurring bounds');
      return {
        rule: { kind: 'AT', atMs: timestampMilliseconds(rule.timestamp) },
      };
    case 'every':
      return {
        rule: {
          kind: 'EVERY',
          everyIntervalSeconds: durationSeconds(rule.interval),
        },
        ...(convertedBounds ? { bounds: convertedBounds } : {}),
      };
    case 'cron':
      if (!rule.expression.trim() || !rule.timezone.trim()) {
        throw invalid('cron expression and timezone are required');
      }
      return {
        rule: {
          kind: 'CRON',
          cronExpression: rule.expression,
          cronTimezone: rule.timezone,
        },
        ...(convertedBounds ? { bounds: convertedBounds } : {}),
      };
  }
}

function boundsInput(
  bounds: AgentScheduleBounds | undefined
): Record<string, unknown> | undefined {
  if (!bounds) return undefined;
  const result: Record<string, unknown> = {};
  if (bounds.startsAt !== undefined)
    result.startsAtMs = timestampMilliseconds(bounds.startsAt);
  if (bounds.until !== undefined)
    result.untilMs = timestampMilliseconds(bounds.until);
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
  if (!status) throw scheduleEmptyResponse();
  const bounds = schedule.bounds ?? {};
  const message = schedule.message ?? {};
  const result: AgentSchedule = {
    name: schedule.name,
    rule: fromWireRule(schedule.rule),
    bounds: {
      ...(bounds.startsAtMs != null
        ? { startsAt: timestampString(bounds.startsAtMs, true) }
        : {}),
      ...(bounds.untilMs != null
        ? { until: timestampString(bounds.untilMs, true) }
        : {}),
      ...(bounds.maxOccurrences != null
        ? {
            maxOccurrences: safeInteger(
              bounds.maxOccurrences,
              'maxOccurrences'
            ),
          }
        : {}),
    },
    text: message.text ?? '',
    status,
    occurrencesUsed: safeInteger(schedule.occurrencesUsed, 'occurrencesUsed'),
    ...(schedule.nextFireAtMs != null
      ? { nextFireAt: timestampString(schedule.nextFireAtMs, true) }
      : {}),
    createdAt: timestampString(schedule.createdAtMs),
    updatedAt: timestampString(schedule.updatedAtMs),
  };
  if (status === 'failed') {
    if (!schedule.failureCode) throw scheduleEmptyResponse();
    const failureCodes: Record<
      NonNullable<WireSchedule['failureCode']>,
      AgentScheduleFailureCode
    > = {
      TARGET_INVALID: 'target_invalid',
      DELIVERY_EXHAUSTED: 'delivery_exhausted',
      PAYLOAD_CONFLICT: 'payload_conflict',
    };
    const code = failureCodes[schedule.failureCode];
    if (!code) throw scheduleEmptyResponse();
    result.failure = {
      code,
      ...(schedule.failureAtMs != null
        ? { at: timestampString(schedule.failureAtMs) }
        : {}),
    };
  }
  return result;
}

function fromWireRule(rule: WireSchedule['rule']): AgentScheduleRule {
  switch (rule.kind) {
    case 'AT':
      if (rule.atMs == null) throw scheduleEmptyResponse();
      return { kind: 'at', timestamp: timestampString(rule.atMs, true) };
    case 'EVERY':
      if (rule.everyIntervalSeconds == null) throw scheduleEmptyResponse();
      return {
        kind: 'every',
        interval: `PT${safeInteger(rule.everyIntervalSeconds, 'interval')}S`,
      };
    case 'CRON':
      if (!rule.cronExpression || !rule.cronTimezone)
        throw scheduleEmptyResponse();
      return {
        kind: 'cron',
        expression: rule.cronExpression,
        timezone: rule.cronTimezone,
      };
  }
  throw scheduleEmptyResponse();
}

function managementInput(
  params: ManageAgentScheduleParams
): Record<string, string> {
  return {
    channelId: channelID(params.channelId),
    name: requireName(params.name),
  };
}

function channelID(value: string | number): string {
  if (
    typeof value === 'number' &&
    (!Number.isSafeInteger(value) || value <= 0)
  ) {
    throw invalid(
      'numeric channelId must be a positive safe integer; use a decimal string for larger IDs'
    );
  }
  const rendered = String(value);
  if (!/^[1-9]\d*$/.test(rendered))
    throw invalid('channelId must be a positive integer');
  return rendered;
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

function timestampMilliseconds(value: string): number {
  const match = RFC3339.exec(value);
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

function timestampString(value: number, semantic = false): string {
  if (!Number.isSafeInteger(value)) throw scheduleEmptyResponse();
  if (semantic && value % 1000 !== 0) throw scheduleEmptyResponse();
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw scheduleEmptyResponse();
  return timestamp.toISOString();
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

function scheduleEmptyResponse(): AlvaError {
  return new AlvaError(
    'GRAPHQL_EMPTY_RESPONSE',
    'GraphQL response did not include a valid schedule',
    502
  );
}
