import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';

/**
 * Push steward tool commands (mono-meta #935). Every call names the steward by
 * its own Session Inbox path, which the host supplies to the embedded `alva`
 * tool; the Backend resolves it to the caller's ready steward binding and
 * scopes every delivery to that binding's Channel.
 */

export type StewardDecision = 'immediate' | 'digest' | 'suppress';

export interface StewardTarget {
  inboxPath: string;
}

export interface StewardDecideParams extends StewardTarget {
  deliveryId: string;
  decision: StewardDecision;
  reason: string;
}

export interface StewardForwardParams extends StewardTarget {
  deliveryId: string;
  /** Idempotency key; the CLI generates a UUID when omitted. */
  requestId?: string;
}

export interface StewardSendParams extends StewardTarget {
  body: string;
  deliveryIds: string[];
  requestId?: string;
}

export interface StewardPendingParams extends StewardTarget {
  afterDeliveryId?: string;
  sinceMs?: number;
  first?: number;
}

export interface StewardBriefedParams extends StewardTarget {
  deliveryIds: string[];
  digestRunId: string;
}

export interface StewardDecideResult {
  state: string;
}

export interface StewardForwardResult {
  channelMessageId: string;
  state: string;
}

export interface StewardSendResult {
  channelMessageId: string;
}

export interface StewardPendingItem {
  deliveryId: string;
  feedEntryId: string;
  source: { kind: string; id: string };
  decisionReason: string;
  consumedAtMs: number;
}

export interface StewardPendingPage {
  items: StewardPendingItem[];
  /** Cursor for the next page; `null` when this page was the last. */
  nextAfterId: string | null;
}

interface GraphQLErrorPayload {
  message?: string;
  extensions?: { code?: string };
}

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: GraphQLErrorPayload[];
}

const GRAPHQL_STATUS_BY_CODE: Readonly<Record<string, number>> = {
  INVALID_ARGUMENT: 400,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  ABORTED: 409,
  FAILED_PRECONDITION: 412,
  RESOURCE_EXHAUSTED: 429,
  INTERNAL: 500,
  UNKNOWN: 500,
  DATA_LOSS: 500,
  UNAVAILABLE: 503,
  DEADLINE_EXCEEDED: 504,
};

const DECIDE = `
mutation ToolkitStewardDecide($input: StewardDecideDeliveryInput!) {
  stewardDecideDelivery(input: $input) { state }
}`.trim();

const FORWARD = `
mutation ToolkitStewardForward($input: StewardForwardAlertInput!) {
  stewardForwardAlert(input: $input) { channelMessageId state }
}`.trim();

const SEND = `
mutation ToolkitStewardSend($input: StewardSendChannelMessageInput!) {
  stewardSendChannelMessage(input: $input) { channelMessageId }
}`.trim();

const PENDING = `
query ToolkitStewardPending($inboxPath: String!, $afterDeliveryId: ID, $sinceMs: TimestampMs, $first: Int) {
  stewardDigestPending(inboxPath: $inboxPath, afterDeliveryId: $afterDeliveryId, sinceMs: $sinceMs, first: $first) {
    items { deliveryId feedEntryId source { kind id } decisionReason consumedAtMs }
    nextAfterId
  }
}`.trim();

const BRIEFED = `
mutation ToolkitStewardBriefed($input: StewardMarkBriefedInput!) {
  stewardMarkBriefed(input: $input) { ok }
}`.trim();

const DECISIONS: ReadonlySet<string> = new Set([
  'immediate',
  'digest',
  'suppress',
]);
const DELIVERY_ID = /^[1-9][0-9]{0,18}$/;

function invalid(message: string): AlvaError {
  return new AlvaError('INVALID_ARGUMENT', message, 400);
}

function requireInboxPath(target: StewardTarget): string {
  if (typeof target.inboxPath !== 'string' || target.inboxPath === '')
    throw invalid('steward commands require the steward Session Inbox path');
  return target.inboxPath;
}

export function requireDeliveryId(
  value: string,
  label = 'delivery id'
): string {
  if (!DELIVERY_ID.test(value))
    throw invalid(`${label} must be a positive integer`);
  return value;
}

export function requireDeliveryIds(values: string[]): string[] {
  if (values.length === 0)
    throw invalid('at least one delivery id is required');
  const unique = new Set<string>();
  for (const value of values) {
    requireDeliveryId(value);
    if (unique.has(value)) throw invalid(`duplicate delivery id ${value}`);
    unique.add(value);
  }
  return [...unique];
}

export function requireDecision(value: string): StewardDecision {
  if (!DECISIONS.has(value))
    throw invalid('decision must be one of immediate, digest, suppress');
  return value as StewardDecision;
}

function requireRequestId(value: string | undefined): string {
  if (value === undefined) return globalThis.crypto.randomUUID();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  )
    throw invalid('request id must be a UUID');
  return value;
}

function emptyResponse(): AlvaError {
  return new AlvaError('EMPTY_RESPONSE', 'steward response was empty', 502);
}

export class StewardResource {
  constructor(private client: AlvaClient) {}

  async decide(params: StewardDecideParams): Promise<StewardDecideResult> {
    this.client._requireAuth();
    const reason = params.reason?.trim();
    if (!reason) throw invalid('a decision reason is required');
    const data = await this.graphql<{
      stewardDecideDelivery?: StewardDecideResult | null;
    }>(DECIDE, {
      input: {
        inboxPath: requireInboxPath(params),
        deliveryId: requireDeliveryId(params.deliveryId),
        decision: requireDecision(params.decision).toUpperCase(),
        reason,
      },
    });
    if (!data.stewardDecideDelivery) throw emptyResponse();
    return data.stewardDecideDelivery;
  }

  async forward(params: StewardForwardParams): Promise<StewardForwardResult> {
    this.client._requireAuth();
    const data = await this.graphql<{
      stewardForwardAlert?: StewardForwardResult | null;
    }>(FORWARD, {
      input: {
        inboxPath: requireInboxPath(params),
        deliveryId: requireDeliveryId(params.deliveryId),
        requestId: requireRequestId(params.requestId),
      },
    });
    if (!data.stewardForwardAlert) throw emptyResponse();
    return data.stewardForwardAlert;
  }

  async send(params: StewardSendParams): Promise<StewardSendResult> {
    this.client._requireAuth();
    const body = params.body?.trim();
    if (!body) throw invalid('a message body is required');
    const data = await this.graphql<{
      stewardSendChannelMessage?: StewardSendResult | null;
    }>(SEND, {
      input: {
        inboxPath: requireInboxPath(params),
        requestId: requireRequestId(params.requestId),
        body,
        deliveryIds: requireDeliveryIds(params.deliveryIds),
      },
    });
    if (!data.stewardSendChannelMessage) throw emptyResponse();
    return data.stewardSendChannelMessage;
  }

  async pending(params: StewardPendingParams): Promise<StewardPendingPage> {
    this.client._requireAuth();
    const first = params.first ?? 50;
    if (!Number.isInteger(first) || first < 1 || first > 100)
      throw invalid('first must be an integer between 1 and 100');
    const data = await this.graphql<{
      stewardDigestPending?: StewardPendingPage | null;
    }>(PENDING, {
      inboxPath: requireInboxPath(params),
      afterDeliveryId:
        params.afterDeliveryId === undefined || params.afterDeliveryId === '0'
          ? null
          : requireDeliveryId(params.afterDeliveryId, 'after'),
      sinceMs: params.sinceMs ?? null,
      first,
    });
    if (!data.stewardDigestPending) throw emptyResponse();
    return {
      items: data.stewardDigestPending.items ?? [],
      nextAfterId: data.stewardDigestPending.nextAfterId ?? null,
    };
  }

  async briefed(params: StewardBriefedParams): Promise<{ ok: true }> {
    this.client._requireAuth();
    const digestRunId = params.digestRunId?.trim();
    if (!digestRunId) throw invalid('a digest run id is required');
    const data = await this.graphql<{
      stewardMarkBriefed?: { ok?: boolean } | null;
    }>(BRIEFED, {
      input: {
        inboxPath: requireInboxPath(params),
        deliveryIds: requireDeliveryIds(params.deliveryIds),
        digestRunId,
      },
    });
    if (data.stewardMarkBriefed?.ok !== true) throw emptyResponse();
    return { ok: true };
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    const response = (await this.client._request('POST', '/query', {
      body: { query, variables },
    })) as GraphQLResponse<T>;
    if (response.errors?.length) {
      const codes = response.errors.map((error) => error.extensions?.code);
      const canonicalCode =
        new Set(codes).size === 1 && typeof codes[0] === 'string'
          ? codes[0]
          : undefined;
      const canonicalStatus = canonicalCode
        ? GRAPHQL_STATUS_BY_CODE[canonicalCode]
        : undefined;
      throw new AlvaError(
        canonicalCode !== undefined && canonicalStatus !== undefined
          ? canonicalCode
          : 'GRAPHQL_ERROR',
        response.errors
          .map((error) => error.message)
          .filter((message): message is string => typeof message === 'string')
          .join('; ') || 'GraphQL request failed',
        canonicalStatus ?? 502,
        { errors: response.errors }
      );
    }
    if (!response.data) throw emptyResponse();
    return response.data;
  }
}
