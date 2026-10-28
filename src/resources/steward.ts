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
  /** Omit or pass [] for a For-You-only Brief that covers no ledger delivery. */
  deliveryIds?: string[];
  requestId?: string;
}

export type StewardSourceKind = 'FEED' | 'MARKET_ENTITY' | 'THESIS_FEED';

export interface StewardPendingParams extends StewardTarget {
  /** @deprecated Use `pendingPage` for explicit single-page reads. */
  after?: string;
  /** First page only: lower bound on decision time. */
  sinceMs?: number;
  /** First page only: fixed upper bound of the Brief window (the digest_request's untilMs). */
  untilMs?: number;
  first?: number;
}

export interface StewardPendingPageParams extends StewardPendingParams {
  /** Opaque cursor from the previous page's `nextCursor`; carries the window. */
  after?: string;
}

export type StewardPendingFullParams = Omit<StewardPendingParams, 'after'> & {
  after?: undefined;
};

export interface StewardBriefedParams extends StewardTarget {
  deliveryIds: string[];
  digestRunId: string;
}

export interface StewardDigestRunParams extends StewardTarget {
  digestRunId: string;
}

export interface StewardSendDigestRunParams extends StewardDigestRunParams {
  /** Exact reviewed coverage; omit or pass [] for a For-You-only Brief. */
  deliveryIds?: string[];
  /** Omit only when the fixed run window is intentionally empty. */
  body?: string;
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
  /** The idempotency key used; pass it as digestRunId to `briefed`. */
  requestId: string;
}

export interface StewardPendingItem {
  deliveryId: string;
  feedEntryId: string;
  source: { kind: StewardSourceKind; id: string };
  decisionReason: string;
  consumedAtMs: number;
  alertSnapshot?: string | null;
}

export interface StewardPendingPage {
  items: StewardPendingItem[];
  /** Cursor for the next page; `null` when this page was the last. */
  nextCursor: string | null;
  /** The window every page of this Brief was read with. */
  windowSinceMs: number;
  windowUntilMs: number;
}

export interface StewardPendingResult {
  items: StewardPendingItem[];
  /** The fixed window used for the complete read. */
  windowSinceMs: number;
  windowUntilMs: number;
}

export type StewardDigestRunState =
  | 'EXPECTED'
  | 'RUNNING'
  | 'SEND_UNCERTAIN'
  | 'SENT'
  | 'INTENTIONALLY_EMPTY'
  | 'FAILED_BEFORE_SEND'
  | 'FAILED'
  | 'FAILED_EXPIRED';

export interface StewardDigestRun {
  digestRunId: string;
  state: StewardDigestRunState;
  scheduleId: string;
  scheduleVersion: number;
  occurrenceIndex: number;
  windowSinceMs: number;
  windowUntilMs: number;
  scanCompletedAtMs?: number | null;
  bodySha256?: string | null;
  coverageSha256?: string | null;
  channelMessageId?: string | null;
  attempts: number;
  lastError: string;
  startedAtMs?: number | null;
  completedAtMs?: number | null;
  sendUncertainAtMs?: number | null;
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
mutation ToolkitStewardDecide($input: UpdateStewardDeliveryInput!) {
  updateStewardDelivery(input: $input) { delivery { deliveryId state } }
}`.trim();

const FORWARD = `
mutation ToolkitStewardForward($input: UpdateStewardDeliveryInput!) {
  updateStewardDelivery(input: $input) { delivery { deliveryId state channelMessageId } }
}`.trim();

const SEND = `
mutation ToolkitStewardSend($input: PostStewardMessageInput!) {
  postStewardMessage(input: $input) { message { channelMessageId requestId } }
}`.trim();

const PENDING = `
query ToolkitStewardPending($inboxPath: String!, $input: StewardDigestPendingInput) {
  viewer {
    stewardDigestPending(inboxPath: $inboxPath, input: $input) {
      edges {
        cursor
        node { deliveryId feedEntryId source { kind id } decisionReason consumedAtMs alertSnapshot }
      }
      pageInfo { hasNextPage endCursor }
      windowSinceMs
      windowUntilMs
    }
  }
}`.trim();

const BRIEFED = `
mutation ToolkitStewardBriefed($input: CompleteStewardBriefInput!) {
  completeStewardBrief(input: $input) { ok }
}`.trim();

const DIGEST_RUN_FIELDS = `
digestRunId state scheduleId scheduleVersion occurrenceIndex
windowSinceMs windowUntilMs scanCompletedAtMs bodySha256 coverageSha256
channelMessageId attempts lastError startedAtMs completedAtMs sendUncertainAtMs
`.trim();

const DIGEST_RUN = `
query ToolkitStewardDigestRun($inboxPath: String!, $digestRunId: String!) {
  viewer { stewardDigestRun(inboxPath: $inboxPath, digestRunId: $digestRunId) { ${DIGEST_RUN_FIELDS} } }
}`.trim();

const DIGEST_RUN_PENDING = `
query ToolkitStewardDigestRunPending($inboxPath: String!, $digestRunId: String!, $input: StewardDigestRunPendingInput) {
  viewer {
    stewardDigestRunPending(inboxPath: $inboxPath, digestRunId: $digestRunId, input: $input) {
      edges {
        node { deliveryId feedEntryId source { kind id } decisionReason consumedAtMs alertSnapshot }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`.trim();

const PUBLISH_DAILY_BRIEF = `
mutation ToolkitStewardPublishDailyBrief($input: PublishStewardDailyBriefInput!) {
  publishStewardDailyBrief(input: $input) { run { ${DIGEST_RUN_FIELDS} } }
}`.trim();

const DECISIONS: ReadonlySet<string> = new Set([
  'immediate',
  'digest',
  'suppress',
]);
const DELIVERY_ID = /^[1-9][0-9]{0,18}$/;
const MAX_LEGACY_BRIEFED_IDS = 100;
const MAX_DIGEST_RUN_COVERAGE = 10_000;
const DIGEST_RUN_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// No shared/testable sleep seam exists in Toolkit today, so retries are
// immediate but strictly bounded to avoid hiding a partial read as success.
const PENDING_ATTEMPTS = 3;
const TRANSIENT_PENDING_CODES: ReadonlySet<string> = new Set([
  'NETWORK_ERROR',
  'NETWORK_TIMEOUT',
  'UNAVAILABLE',
  'DEADLINE_EXCEEDED',
]);
const TRANSIENT_HTTP_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

function invalid(message: string): AlvaError {
  return new AlvaError('INVALID_ARGUMENT', message, 400);
}

function requireInboxPath(target: StewardTarget): string {
  if (
    !target ||
    typeof target.inboxPath !== 'string' ||
    target.inboxPath === ''
  )
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

export function normalizeDeliveryIds(values: string[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    requireDeliveryId(value);
    if (unique.has(value)) throw invalid(`duplicate delivery id ${value}`);
    unique.add(value);
  }
  return [...unique];
}

export function requireDeliveryIds(values: string[]): string[] {
  if (values.length === 0)
    throw invalid('at least one delivery id is required');
  return normalizeDeliveryIds(values);
}

export function requireDecision(value: string): StewardDecision {
  if (!DECISIONS.has(value))
    throw invalid('decision must be one of immediate, digest, suppress');
  return value as StewardDecision;
}

/** RFC 4122 v4 UUID without assuming `crypto.randomUUID` (absent on Node 18 and older browsers). */
export function generateRequestId(): string {
  const webcrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (typeof webcrypto?.randomUUID === 'function')
    return webcrypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof webcrypto?.getRandomValues === 'function') {
    webcrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1)
      bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    ''
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function requireRequestId(value: string | undefined): string {
  if (value === undefined) return generateRequestId();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  )
    throw invalid('request id must be a UUID');
  return value;
}

function requireDigestRunId(value: string): string {
  if (!DIGEST_RUN_ID.test(value)) throw invalid('digest run id must be a UUID');
  return value.toLowerCase();
}

function isTransientStewardError(error: unknown): error is AlvaError {
  return (
    error instanceof AlvaError &&
    (TRANSIENT_PENDING_CODES.has(error.code) ||
      TRANSIENT_HTTP_STATUSES.has(error.status))
  );
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
      updateStewardDelivery?: { delivery?: { state: string } | null } | null;
    }>(DECIDE, {
      input: {
        inboxPath: requireInboxPath(params),
        deliveryId: requireDeliveryId(params.deliveryId),
        decision: {
          decision: requireDecision(params.decision).toUpperCase(),
          reason,
        },
      },
    });
    const delivery = data.updateStewardDelivery?.delivery;
    if (!delivery) throw emptyResponse();
    return { state: delivery.state };
  }

  async forward(params: StewardForwardParams): Promise<StewardForwardResult> {
    this.client._requireAuth();
    const data = await this.graphql<{
      updateStewardDelivery?: {
        delivery?: { state: string; channelMessageId?: string | null } | null;
      } | null;
    }>(FORWARD, {
      input: {
        inboxPath: requireInboxPath(params),
        deliveryId: requireDeliveryId(params.deliveryId),
        forward: { requestId: requireRequestId(params.requestId) },
      },
    });
    const delivery = data.updateStewardDelivery?.delivery;
    if (!delivery || !delivery.channelMessageId) throw emptyResponse();
    return {
      channelMessageId: delivery.channelMessageId,
      state: delivery.state,
    };
  }

  async send(params: StewardSendParams): Promise<StewardSendResult> {
    this.client._requireAuth();
    if (typeof params.body !== 'string' || params.body.trim() === '')
      throw invalid('a message body is required');
    const data = await this.graphql<{
      postStewardMessage?: { message?: StewardSendResult | null } | null;
    }>(SEND, {
      input: {
        inboxPath: requireInboxPath(params),
        requestId: requireRequestId(params.requestId),
        body: params.body,
        // A For-You-only Brief covers no ledger delivery, so an empty (or
        // omitted) set is valid here; the backend accepts it. `briefed` still
        // requires ids.
        deliveryIds: normalizeDeliveryIds(params.deliveryIds ?? []),
      },
    });
    const message = data.postStewardMessage?.message;
    if (!message) throw emptyResponse();
    return message;
  }

  async pending(
    params: StewardPendingParams & { after: string }
  ): Promise<StewardPendingPage>;
  async pending(
    params: StewardPendingFullParams
  ): Promise<StewardPendingResult>;
  async pending(
    params: StewardPendingParams
  ): Promise<StewardPendingResult | StewardPendingPage>;
  async pending(
    params: StewardPendingParams
  ): Promise<StewardPendingResult | StewardPendingPage> {
    if (params.after !== undefined) return this.pendingPage(params);
    const items: StewardPendingItem[] = [];
    const deliveryIds = new Set<string>();
    const cursors = new Set<string>();
    let after: string | undefined;
    let windowSinceMs: number | undefined;
    let windowUntilMs: number | undefined;

    do {
      const page = await this.pendingPageWithRetry({
        ...params,
        after,
        sinceMs: after === undefined ? params.sinceMs : undefined,
        untilMs: after === undefined ? params.untilMs : undefined,
      });
      if (windowSinceMs === undefined) {
        windowSinceMs = page.windowSinceMs;
        windowUntilMs = page.windowUntilMs;
      } else if (
        page.windowSinceMs !== windowSinceMs ||
        page.windowUntilMs !== windowUntilMs
      ) {
        throw new AlvaError(
          'ABORTED',
          'steward pending window changed during pagination',
          409
        );
      }
      for (const item of page.items) {
        if (deliveryIds.has(item.deliveryId)) continue;
        deliveryIds.add(item.deliveryId);
        items.push(item);
      }
      after = page.nextCursor ?? undefined;
      if (after !== undefined) {
        if (cursors.has(after)) {
          throw new AlvaError(
            'INTERNAL',
            'steward pending pagination loop detected',
            500
          );
        }
        cursors.add(after);
      }
    } while (after !== undefined);

    if (windowSinceMs === undefined || windowUntilMs === undefined)
      throw emptyResponse();
    return {
      items,
      windowSinceMs,
      windowUntilMs,
    };
  }

  async pendingPage(
    params: StewardPendingPageParams
  ): Promise<StewardPendingPage> {
    this.client._requireAuth();
    const first = params.first ?? 50;
    if (!Number.isInteger(first) || first < 1 || first > 100)
      throw invalid('first must be an integer between 1 and 100');
    const input: Record<string, unknown> = { first };
    if (params.after !== undefined && params.after !== '') {
      input.after = params.after;
    } else {
      for (const [label, value] of [
        ['sinceMs', params.sinceMs],
        ['untilMs', params.untilMs],
      ] as const) {
        if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0))
          throw invalid(`${label} must be a positive safe integer timestamp`);
      }
      if (
        params.sinceMs !== undefined &&
        params.untilMs !== undefined &&
        params.untilMs <= params.sinceMs
      )
        throw invalid('untilMs must be after sinceMs');
      if (params.sinceMs !== undefined) input.sinceMs = params.sinceMs;
      if (params.untilMs !== undefined) input.untilMs = params.untilMs;
    }
    const data = await this.graphql<{
      viewer?: {
        stewardDigestPending?: {
          edges?: Array<{ cursor: string; node: StewardPendingItem }>;
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          windowSinceMs?: number;
          windowUntilMs?: number;
        } | null;
      } | null;
    }>(PENDING, { inboxPath: requireInboxPath(params), input });
    const page = data.viewer?.stewardDigestPending;
    if (!page || !Array.isArray(page.edges)) throw emptyResponse();
    const windowSinceMs = page.windowSinceMs ?? 0;
    const windowUntilMs = page.windowUntilMs ?? 0;
    if (
      !Number.isSafeInteger(windowSinceMs) ||
      !Number.isSafeInteger(windowUntilMs) ||
      windowSinceMs <= 0 ||
      windowUntilMs <= windowSinceMs
    )
      throw emptyResponse();
    const items = page.edges.map((edge) => edge.node);
    const pageInfo = page.pageInfo;
    if (!pageInfo || typeof pageInfo.hasNextPage !== 'boolean')
      throw emptyResponse();
    const endCursor = pageInfo.endCursor;
    if (
      endCursor !== undefined &&
      endCursor !== null &&
      typeof endCursor !== 'string'
    )
      throw emptyResponse();
    if (pageInfo.hasNextPage && !endCursor) throw emptyResponse();
    const nextCursor = pageInfo.hasNextPage ? (endCursor as string) : null;
    return {
      items,
      nextCursor,
      windowSinceMs,
      windowUntilMs,
    };
  }

  private async pendingPageWithRetry(
    params: StewardPendingPageParams
  ): Promise<StewardPendingPage> {
    for (let attempt = 1; attempt < PENDING_ATTEMPTS; attempt += 1) {
      try {
        return await this.pendingPage(params);
      } catch (error) {
        if (!isTransientStewardError(error)) throw error;
      }
    }
    return this.pendingPage(params);
  }

  async briefed(params: StewardBriefedParams): Promise<{ ok: true }> {
    this.client._requireAuth();
    const digestRunId = params.digestRunId?.trim();
    if (!digestRunId) throw invalid('a digest run id is required');
    const inboxPath = requireInboxPath(params);
    const deliveryIds = requireDeliveryIds(params.deliveryIds);
    if (deliveryIds.length > MAX_LEGACY_BRIEFED_IDS)
      throw invalid('legacy briefed accepts at most 100 delivery ids');
    const data = await this.graphql<{
      completeStewardBrief?: { ok?: boolean } | null;
    }>(BRIEFED, {
      input: {
        inboxPath,
        deliveryIds,
        digestRunId,
      },
    });
    if (data.completeStewardBrief?.ok !== true) throw emptyResponse();
    return { ok: true };
  }

  async digestRun(params: StewardDigestRunParams): Promise<StewardDigestRun> {
    this.client._requireAuth();
    const data = await this.graphql<{
      viewer?: { stewardDigestRun?: StewardDigestRun | null } | null;
    }>(DIGEST_RUN, {
      inboxPath: requireInboxPath(params),
      digestRunId: requireDigestRunId(params.digestRunId),
    });
    const run = data.viewer?.stewardDigestRun;
    if (!run) throw emptyResponse();
    return run;
  }

  async digestRunPending(
    params: StewardDigestRunParams
  ): Promise<StewardPendingItem[]> {
    this.client._requireAuth();
    const inboxPath = requireInboxPath(params);
    const digestRunId = requireDigestRunId(params.digestRunId);
    const items: StewardPendingItem[] = [];
    let after: string | undefined;
    for (;;) {
      const data = await this.graphql<{
        viewer?: {
          stewardDigestRunPending?: {
            edges?: Array<{ node?: StewardPendingItem | null } | null> | null;
            pageInfo?: {
              hasNextPage?: boolean;
              endCursor?: string | null;
            } | null;
          } | null;
        } | null;
      }>(DIGEST_RUN_PENDING, {
        inboxPath,
        digestRunId,
        input: { first: 100, ...(after === undefined ? {} : { after }) },
      });
      const connection = data.viewer?.stewardDigestRunPending;
      if (!connection || !Array.isArray(connection.edges))
        throw emptyResponse();
      for (const edge of connection.edges) {
        if (!edge?.node) throw emptyResponse();
        items.push(edge.node);
      }
      if (connection.pageInfo?.hasNextPage !== true) break;
      const next = connection.pageInfo.endCursor;
      if (typeof next !== 'string' || next === '' || next === after)
        throw emptyResponse();
      after = next;
    }
    return items;
  }

  async sendDigestRun(
    params: StewardSendDigestRunParams
  ): Promise<StewardDigestRun> {
    this.client._requireAuth();
    const deliveryIds = normalizeDeliveryIds(params.deliveryIds ?? []);
    if (deliveryIds.length > MAX_DIGEST_RUN_COVERAGE)
      throw invalid('durable Daily Brief accepts at most 10000 delivery ids');
    if (params.body !== undefined && params.body.trim() === '')
      throw invalid('a message body must be non-blank when provided');
    if (params.body === undefined && deliveryIds.length !== 0)
      throw invalid('delivery ids require a message body');
    const data = await this.graphql<{
      publishStewardDailyBrief?: { run?: StewardDigestRun | null } | null;
    }>(PUBLISH_DAILY_BRIEF, {
      input: {
        inboxPath: requireInboxPath(params),
        digestRunId: requireDigestRunId(params.digestRunId),
        deliveryIds,
        ...(params.body === undefined ? {} : { body: params.body }),
      },
    });
    const run = data.publishStewardDailyBrief?.run;
    if (!run) throw emptyResponse();
    return run;
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    const response = (await this.client._request('POST', '/query', {
      body: { query, variables },
    })) as GraphQLResponse<T> | null | undefined;
    if (!response || typeof response !== 'object') throw emptyResponse();
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
