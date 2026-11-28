/**
 * The /api/v2 wire of the trade mode and rebalance proposals
 * (alva-gateway `pkg/v2/api/theses/rebalance.go`), hand-written for these
 * five operations and converted into the toolkit's snake_case output types.
 * Re-express it on the generated OpenAPI types when Toolkit 1.0
 * (alva-ai/toolkit-ts#215) lands.
 *
 * v2 bodies are lowerCamelCase, every member is present and null without a
 * value, decimals are strings, times are RFC 3339 strings and enums are upper
 * case (any of them may be UNKNOWN). IDs are opaque: matched against their
 * type's pattern, never parsed or built.
 */
import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import type {
  ThesisTradeMode,
  ThesisPositionChange,
  ThesisPositionDirection,
  ThesisRebalanceCondition,
  ThesisRebalanceProposal,
  ThesisRebalanceProposalState,
  ThesisRebalanceProposalsResponse,
} from './theses.js';

/** v2 wire `WatchpointCondition`. */
export interface V2WatchpointCondition {
  id: string;
  label: string;
  kind: 'NUMERIC' | 'INFORMATIONAL' | 'UNKNOWN';
  assetId: string | null;
  symbol: string | null;
  metric: string | null;
  comparison: string | null;
  threshold: string | null;
  event: string | null;
  state: 'ARMED' | 'WATCHING' | 'TRIGGERED' | 'CLOSED' | 'UNKNOWN';
  closeReason: string | null;
  triggeredAt: string | null;
  observedValue: string | null;
  decision: string | null;
}

/** v2 wire `PositionChange`. */
export interface V2PositionChange {
  assetId: string;
  symbol: string;
  fromDirection: 'BULLISH' | 'BEARISH' | 'NONE' | 'UNKNOWN';
  fromWeight: string | null;
  direction: 'BULLISH' | 'BEARISH' | 'NONE' | 'UNKNOWN';
  weight: string | null;
}

/** v2 wire `RebalanceProposal`. */
export interface V2RebalanceProposal {
  id: string;
  thesisId: string;
  state: string;
  condition: V2WatchpointCondition;
  changes: V2PositionChange[];
  reasoning: string;
  importance: string;
  confident: boolean;
  mode: 'MANUAL' | 'AUTO' | 'YOLO';
  createdAt: string;
  deliveredAt: string | null;
  expiresAt: string | null;
  versionId: string | null;
}

/** v2 wire `DecisionModeSetting`. */
export interface V2DecisionModeSetting {
  mode: 'MANUAL' | 'AUTO' | 'YOLO';
}

/** v2 wire `List<RebalanceProposal>`. */
export interface V2RebalanceProposalList {
  items: V2RebalanceProposal[];
  nextPageToken: string | null;
}

const ID_BODY = '_0[0-9a-hjkmnp-tv-z]+$';
export const V2_THESIS_ID = new RegExp(`^thesis${ID_BODY}`);
export const V2_REBALANCE_PROPOSAL_ID = new RegExp(
  `^thesis_rebalance_proposal${ID_BODY}`
);
const V2_CONDITION_ID = new RegExp(`^thesis_watchpoint_condition${ID_BODY}`);
const V2_ASSET_ID = new RegExp(`^asset${ID_BODY}`);
const V2_VERSION_ID = new RegExp(`^thesis_version${ID_BODY}`);

const DECISION_MODES: readonly string[] = ['MANUAL', 'AUTO', 'YOLO'];
const PROPOSAL_STATES: readonly string[] = [
  'NO_CHANGE',
  'APPLYING',
  'APPLIED',
  'WAITING',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'VOID',
];
const CONDITION_KINDS: readonly string[] = ['NUMERIC', 'INFORMATIONAL'];
const CONDITION_STATES: readonly string[] = [
  'ARMED',
  'WATCHING',
  'TRIGGERED',
  'CLOSED',
];
const DIRECTIONS: Record<string, ThesisPositionDirection> = {
  BULLISH: 'long',
  BEARISH: 'short',
  NONE: 'none',
};

/**
 * The v2 Thesis id of the Thesis numbered `number` (the numeric id the CLI
 * takes), read with GET /api/v2/theses/by-number/{number}.
 */
export async function resolveV2ThesisID(
  client: AlvaClient,
  number: string
): Promise<string> {
  const thesis = await client._request(
    'GET',
    `/api/v2/theses/by-number/${number}`
  );
  if (!isRecord(thesis) || !matches(thesis.id, V2_THESIS_ID))
    throw invalid('the Thesis read by number has no valid id');
  if (
    typeof thesis.number === 'number' &&
    Number.isSafeInteger(thesis.number) &&
    String(thesis.number) !== number
  )
    throw invalid('the Thesis read by number is another Thesis');
  return thesis.id;
}

export function tradeModeOf(value: unknown): ThesisTradeMode {
  if (!isRecord(value) || !DECISION_MODES.includes(value.mode as string))
    throw invalid('response contains an unknown trade mode');
  return (value.mode as string).toLowerCase() as ThesisTradeMode;
}

export function proposalPageOf(
  value: unknown,
  thesisID: string,
  pageSize: number
): ThesisRebalanceProposalsResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    value.items.length > pageSize ||
    (value.nextPageToken !== null && !nonempty(value.nextPageToken))
  )
    throw invalid('invalid rebalance proposal list');
  return {
    proposals: value.items.map((item, index) =>
      proposalOf(item, thesisID, `items[${index}]`)
    ),
    next_cursor: (value.nextPageToken as string | null) ?? '',
  };
}

export function proposalOf(
  value: unknown,
  thesisID: string,
  field = 'proposal'
): ThesisRebalanceProposal {
  if (
    !isRecord(value) ||
    !matches(value.id, V2_REBALANCE_PROPOSAL_ID) ||
    value.thesisId !== thesisID ||
    !PROPOSAL_STATES.includes(value.state as string) ||
    !DECISION_MODES.includes(value.mode as string) ||
    typeof value.confident !== 'boolean' ||
    typeof value.reasoning !== 'string' ||
    !nonempty(value.importance) ||
    !Array.isArray(value.changes)
  )
    throw invalid(`${field} is not a valid rebalance proposal`);
  const proposal: ThesisRebalanceProposal = {
    id: value.id,
    state: (
      value.state as string
    ).toLowerCase() as ThesisRebalanceProposalState,
    condition: conditionOf(value.condition, `${field}.condition`),
    changes: value.changes.map((item, index) =>
      changeOf(item, `${field}.changes[${index}]`)
    ),
    reasoning: value.reasoning,
    importance: value.importance.toLowerCase(),
    confident: value.confident,
    mode: (value.mode as string).toLowerCase() as ThesisTradeMode,
    created_at_ms: requiredTime(value.createdAt, `${field}.createdAt`),
  };
  const delivered = time(value.deliveredAt, `${field}.deliveredAt`);
  if (delivered !== undefined) proposal.delivered_at_ms = delivered;
  const expires = time(value.expiresAt, `${field}.expiresAt`);
  if (expires !== undefined) proposal.expires_at_ms = expires;
  if (value.versionId !== null) {
    if (!matches(value.versionId, V2_VERSION_ID))
      throw invalid(`${field}.versionId is not a Thesis version id`);
    proposal.version_id = value.versionId;
  }
  return proposal;
}

function conditionOf(value: unknown, field: string): ThesisRebalanceCondition {
  if (
    !isRecord(value) ||
    !matches(value.id, V2_CONDITION_ID) ||
    !nonempty(value.label) ||
    !CONDITION_KINDS.includes(value.kind as string) ||
    !CONDITION_STATES.includes(value.state as string)
  )
    throw invalid(`${field} is not a valid condition`);
  const condition: ThesisRebalanceCondition = {
    id: value.id,
    label: value.label,
    kind: (
      value.kind as string
    ).toLowerCase() as ThesisRebalanceCondition['kind'],
    state: (
      value.state as string
    ).toLowerCase() as ThesisRebalanceCondition['state'],
  };
  if (value.assetId !== null) {
    if (!matches(value.assetId, V2_ASSET_ID))
      throw invalid(`${field}.assetId is not an asset id`);
    condition.entity_id = value.assetId;
  }
  const symbol = text(value.symbol, `${field}.symbol`);
  if (symbol !== undefined) condition.ticker = symbol;
  const event = text(value.event, `${field}.event`);
  if (event !== undefined) condition.event = event;
  for (const [from, to] of [
    ['metric', 'metric'],
    ['comparison', 'comparison'],
    ['closeReason', 'close_reason'],
    ['decision', 'decision'],
  ] as const) {
    const word = text(value[from], `${field}.${from}`);
    if (word !== undefined) condition[to] = word.toLowerCase();
  }
  const threshold = decimal(value.threshold, `${field}.threshold`);
  if (threshold !== undefined) condition.threshold = threshold;
  const observed = decimal(value.observedValue, `${field}.observedValue`);
  if (observed !== undefined) condition.observed_value = observed;
  const triggered = time(value.triggeredAt, `${field}.triggeredAt`);
  if (triggered !== undefined) condition.triggered_at_ms = triggered;
  return condition;
}

function changeOf(value: unknown, field: string): ThesisPositionChange {
  if (
    !isRecord(value) ||
    !matches(value.assetId, V2_ASSET_ID) ||
    typeof value.symbol !== 'string' ||
    !(String(value.fromDirection) in DIRECTIONS) ||
    !(String(value.direction) in DIRECTIONS)
  )
    throw invalid(`${field} is not a valid position change`);
  const change: ThesisPositionChange = {
    entity_id: value.assetId,
    ticker: value.symbol,
    from_direction: DIRECTIONS[value.fromDirection as string],
    direction: DIRECTIONS[value.direction as string],
  };
  for (const [from, to] of [
    ['fromWeight', 'from_weight'],
    ['weight', 'weight'],
  ] as const) {
    const weight = decimal(value[from], `${field}.${from}`);
    if (weight === undefined) continue;
    if (weight < 0 || weight > 1)
      throw invalid(`${field}.${from} must be a fraction in [0, 1]`);
    change[to] = weight;
  }
  return change;
}

/** A nullable string member: null is undefined. */
function text(value: unknown, field: string): string | undefined {
  if (value === null) return undefined;
  if (typeof value !== 'string') throw invalid(`${field} must be a string`);
  return value;
}

/** A nullable v2 Decimal ("149.6"): null is undefined. */
function decimal(value: unknown, field: string): number | undefined {
  if (value === null) return undefined;
  if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value))
    throw invalid(`${field} must be a decimal string`);
  return Number(value);
}

/** A nullable RFC 3339 time as epoch milliseconds: null is undefined. */
function time(value: unknown, field: string): number | undefined {
  if (value === null) return undefined;
  return requiredTime(value, field);
}

function requiredTime(value: unknown, field: string): number {
  const ms =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
      ? Date.parse(value)
      : NaN;
  if (!Number.isFinite(ms)) throw invalid(`${field} must be an RFC 3339 time`);
  return ms;
}

function matches(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): AlvaError {
  return new AlvaError('INVALID_RESPONSE', message, 502);
}
