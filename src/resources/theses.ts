import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';

/** Thesis IDs are signed int64 values represented losslessly as decimal strings. */
export type ThesisID = string;
export type ThesisVisibility = 'public' | 'private';
/** Canonical server-supported candidate rewrite operation. */
export type ThesisRewriteMode = 'reformat' | 'shorten' | 'enrich';

export interface Thesis {
  id: ThesisID;
  author_version_id: ThesisID;
  material_version_id: ThesisID;
  title: string;
  body: string;
  entity_ids: ThesisID[];
  visibility: ThesisVisibility;
  closed: boolean;
  closing_note: string;
  author_kind: string;
  author_ref: string;
}

export interface ThesisResponse {
  thesis: Thesis;
}

export interface ThesisAuthor {
  id: ThesisID;
  kind: string;
  display_name: string;
  avatar_url: string;
  username: string;
}

export interface ThesisEntity {
  id: ThesisID;
  ticker: string;
  name: string;
  icon_url: string;
  kind: string;
}

export interface ThesisGetResponse extends ThesisResponse {
  author: ThesisAuthor;
  entities: ThesisEntity[];
}

export interface ThesisResearchStatus {
  state: string;
  pending_work: number;
  read_complete: boolean;
  last_attempt_ms?: number;
  last_completed_ms?: number;
}

export interface ThesisSignalEvidenceExcerpt {
  text: string;
  omitted_before: boolean;
  omitted_after: boolean;
}

export interface ThesisSignalSource {
  title: string;
  url?: string;
  published_at_ms?: number;
}

export interface ThesisSignal {
  id: ThesisID;
  thesis_id: ThesisID;
  author_version_id: ThesisID;
  statement_snapshot: string;
  stance: string;
  explanation: string;
  information_kind: string;
  evidence_excerpt?: ThesisSignalEvidenceExcerpt;
  source: ThesisSignalSource;
}

export interface ThesisSignalEntry {
  feed_entry_id: ThesisID;
  cursor: string;
  signal: ThesisSignal;
}

export interface ListThesisSignalsParams {
  first?: number;
  cursor?: string;
}

export interface ThesisSignalsResponse {
  research: ThesisResearchStatus;
  entries: ThesisSignalEntry[];
  next_cursor: string;
}

export interface CreateThesisParams {
  /** Caller-supplied, stable non-zero UUID. Reuse it only to resolve ambiguity. */
  request_id: string;
  body: string;
  title?: string;
  entity_ids?: ThesisID[];
  /** Exact STOCK ticker symbols resolved by Backend during creation. */
  tickers?: string[];
  /** Omitted means public, as defined by the REST contract. */
  visibility?: ThesisVisibility;
}

export interface UpdateThesisParams {
  /** Caller-supplied, stable non-zero UUID. Reuse it only to resolve ambiguity. */
  request_id: string;
  expected_author_version_id: ThesisID;
  body: string;
  title?: string;
  entity_ids?: ThesisID[];
  /** Required so an update cannot inadvertently publish a private thesis. */
  visibility: ThesisVisibility;
  editorial?: boolean;
}

export interface SetThesisVisibilityParams {
  visibility: ThesisVisibility;
}

export interface CloseThesisParams {
  expected_author_version_id: ThesisID;
  note?: string;
}

export interface RewriteThesisParams {
  body: string;
  /** Omitted selects the canonical `reformat` mode. */
  mode?: ThesisRewriteMode;
}

export interface RewriteThesisResponse {
  body: string;
}

const MAX_SIGNED_INT64 = 9_223_372_036_854_775_807n;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNPAIRED_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const encoder = new TextEncoder();

/**
 * Thesis CRUD and explicit text rewriting. This resource never retries,
 * starts Signal/Alert setup, or invokes rewrite as a side effect of CRUD.
 */
export class ThesesResource {
  constructor(private client: AlvaClient) {}

  async create(params: CreateThesisParams): Promise<ThesisResponse> {
    this.client._requireAuth();
    const body = createBody(params);
    return thesisResponse(
      await this.client._request('POST', '/api/v1/theses', { body })
    );
  }

  async get(id: ThesisID): Promise<ThesisGetResponse> {
    this.client._requireAuth();
    return thesisGetResponse(
      await this.client._request('GET', `/api/v1/theses/${requireID(id, 'id')}`)
    );
  }

  async signals(
    id: ThesisID,
    params: ListThesisSignalsParams = {}
  ): Promise<ThesisSignalsResponse> {
    this.client._requireAuth();
    const first = params.first ?? 20;
    if (!Number.isInteger(first) || first < 1 || first > 50) {
      throw invalidArgument('first must be an integer between 1 and 50');
    }
    if (params.cursor !== undefined && typeof params.cursor !== 'string') {
      throw invalidArgument('cursor must be a string');
    }
    return thesisSignalsResponse(
      await this.client._request(
        'GET',
        `/api/v1/theses/${requireID(id, 'id')}/signals`,
        {
          query: {
            first,
            ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
          },
        }
      ),
      id,
      first
    );
  }

  async update(
    id: ThesisID,
    params: UpdateThesisParams
  ): Promise<ThesisResponse> {
    this.client._requireAuth();
    const body = updateBody(params);
    return thesisResponse(
      await this.client._request(
        'PUT',
        `/api/v1/theses/${requireID(id, 'id')}`,
        {
          body,
        }
      )
    );
  }

  async setVisibility(
    id: ThesisID,
    params: SetThesisVisibilityParams
  ): Promise<ThesisResponse> {
    this.client._requireAuth();
    if (!params) {
      throw invalidArgument('params is required');
    }
    const thesisID = requireID(id, 'id');
    const visibility = requireVisibility(params.visibility);
    const response = thesisResponse(
      await this.client._request(
        'POST',
        `/api/v1/theses/${thesisID}/visibility`,
        { body: { visibility } }
      )
    );
    if (
      response.thesis.id !== thesisID ||
      response.thesis.visibility !== visibility
    ) {
      throw invalidResponse(
        'visibility response must match the requested thesis and visibility'
      );
    }
    return response;
  }

  async close(
    id: ThesisID,
    params: CloseThesisParams
  ): Promise<ThesisResponse> {
    this.client._requireAuth();
    const body: CloseThesisParams = {
      expected_author_version_id: requireID(
        params.expected_author_version_id,
        'expected_author_version_id'
      ),
    };
    if (params.note !== undefined) body.note = requireText(params.note, 'note');
    return thesisResponse(
      await this.client._request(
        'POST',
        `/api/v1/theses/${requireID(id, 'id')}/close`,
        { body }
      )
    );
  }

  async delete(id: ThesisID): Promise<Record<string, never>> {
    this.client._requireAuth();
    const response = await this.client._request(
      'DELETE',
      `/api/v1/theses/${requireID(id, 'id')}`
    );
    // _request returns undefined only for a successful HTTP 204 response.
    if (response === undefined) return {};
    if (!isRecord(response) || Object.keys(response).length !== 0) {
      throw invalidResponse('delete response must be {}');
    }
    return {};
  }

  async rewrite(params: RewriteThesisParams): Promise<RewriteThesisResponse> {
    this.client._requireAuth();
    const body = requireBody(params.body);
    // Only omission selects the default. Empty, whitespace, null, and unknown
    // runtime values must remain visible validation failures.
    const mode =
      params.mode === undefined ? 'reformat' : requireRewriteMode(params.mode);
    const response = await this.client._request(
      'POST',
      '/api/v1/theses/rewrite',
      {
        body: { body, mode },
      }
    );
    if (!isRecord(response) || typeof response.body !== 'string') {
      throw invalidResponse('rewrite response must contain a string body');
    }
    return { body: responseBody(response.body) };
  }
}

function createBody(
  params: CreateThesisParams
): Required<Omit<CreateThesisParams, 'tickers'>> & { tickers?: string[] } {
  const body: Required<Omit<CreateThesisParams, 'tickers'>> & {
    tickers?: string[];
  } = {
    request_id: requireRequestID(params.request_id),
    body: requireBody(params.body),
    title: requireTitle(params.title ?? ''),
    entity_ids: requireIDs(params.entity_ids ?? [], 'entity_ids'),
    visibility: requireVisibility(params.visibility ?? 'public'),
  };
  if (params.tickers !== undefined)
    body.tickers = requireTickers(params.tickers);
  return body;
}

function updateBody(params: UpdateThesisParams): Required<UpdateThesisParams> {
  return {
    request_id: requireRequestID(params.request_id),
    expected_author_version_id: requireID(
      params.expected_author_version_id,
      'expected_author_version_id'
    ),
    body: requireBody(params.body),
    title: requireTitle(params.title ?? ''),
    entity_ids: requireIDs(params.entity_ids ?? [], 'entity_ids'),
    visibility: requireVisibility(params.visibility),
    editorial: params.editorial ?? false,
  };
}

function thesisResponse(response: unknown): ThesisResponse {
  if (!isRecord(response) || !isRecord(response.thesis)) {
    throw invalidResponse('response must contain thesis');
  }
  const thesis = response.thesis;
  const value: Thesis = {
    id: responseID(thesis.id, 'thesis.id'),
    author_version_id: responseID(
      thesis.author_version_id,
      'thesis.author_version_id'
    ),
    material_version_id: responseID(
      thesis.material_version_id,
      'thesis.material_version_id'
    ),
    title: responseTitle(thesis.title),
    body: responseBody(thesis.body),
    entity_ids: responseIDs(thesis.entity_ids, 'thesis.entity_ids'),
    visibility: responseVisibility(thesis.visibility),
    closed: responseBoolean(thesis.closed, 'thesis.closed'),
    closing_note: responseClosingNote(thesis.closing_note),
    author_kind: responseText(thesis.author_kind, 'thesis.author_kind'),
    author_ref: responseText(thesis.author_ref, 'thesis.author_ref'),
  };
  return { thesis: value };
}

function thesisGetResponse(response: unknown): ThesisGetResponse {
  const base = thesisResponse(response);
  if (!isRecord(response) || !isRecord(response.author)) {
    throw invalidResponse('response must contain author');
  }
  const authorRecord = response.author;
  const author: ThesisAuthor = {
    id: responseID(authorRecord.id, 'author.id'),
    kind: responseText(authorRecord.kind, 'author.kind'),
    display_name: responseText(
      authorRecord.display_name,
      'author.display_name'
    ),
    avatar_url: responseText(authorRecord.avatar_url, 'author.avatar_url'),
    username: responseText(authorRecord.username, 'author.username'),
  };
  if (!Array.isArray(response.entities)) {
    throw invalidResponse('response must contain entities');
  }
  if (response.entities.length !== base.thesis.entity_ids.length) {
    throw invalidResponse('entities must match thesis.entity_ids');
  }
  const entities = response.entities.map((item, index) => {
    if (!isRecord(item))
      throw invalidResponse(`entities[${index}] must be an object`);
    const entity: ThesisEntity = {
      id: responseID(item.id, `entities[${index}].id`),
      ticker: responseText(item.ticker, `entities[${index}].ticker`),
      name: responseText(item.name, `entities[${index}].name`),
      icon_url: responseText(item.icon_url, `entities[${index}].icon_url`),
      kind: responseText(item.kind, `entities[${index}].kind`),
    };
    if (entity.id !== base.thesis.entity_ids[index]) {
      throw invalidResponse('entities must preserve thesis.entity_ids order');
    }
    return entity;
  });
  return { thesis: base.thesis, author, entities };
}

function thesisSignalsResponse(
  response: unknown,
  thesisID: ThesisID,
  first: number
): ThesisSignalsResponse {
  if (
    !isRecord(response) ||
    !isRecord(response.research) ||
    !Array.isArray(response.entries) ||
    response.entries.length > first
  ) {
    throw invalidResponse('invalid Signal history response');
  }
  const research = response.research;
  const status: ThesisResearchStatus = {
    state: responseText(research.state, 'research.state'),
    pending_work: responseNonnegativeInteger(
      research.pending_work,
      'research.pending_work'
    ),
    read_complete: responseBoolean(
      research.read_complete,
      'research.read_complete'
    ),
  };
  if (research.last_attempt_ms !== undefined)
    status.last_attempt_ms = responseNonnegativeInteger(
      research.last_attempt_ms,
      'research.last_attempt_ms'
    );
  if (research.last_completed_ms !== undefined)
    status.last_completed_ms = responseNonnegativeInteger(
      research.last_completed_ms,
      'research.last_completed_ms'
    );

  const entries = response.entries.map((raw): ThesisSignalEntry => {
    if (
      !isRecord(raw) ||
      !isRecord(raw.signal) ||
      !isRecord(raw.signal.source)
    ) {
      throw invalidResponse('entry must include a Signal and source');
    }
    const signal = raw.signal;
    const source = signal.source as Record<string, unknown>;
    const signalID = responseID(signal.thesis_id, 'signal.thesis_id');
    if (signalID !== thesisID)
      throw invalidResponse('Signal belongs to another Thesis');
    const cursor = responseNonemptyText(raw.cursor, 'entry.cursor');
    const mappedSource: ThesisSignalSource = {
      title: responseText(source.title, 'source.title'),
    };
    if (source.url !== undefined)
      mappedSource.url = responseText(source.url, 'source.url');
    if (source.published_at_ms !== undefined)
      mappedSource.published_at_ms = responseNonnegativeInteger(
        source.published_at_ms,
        'source.published_at_ms'
      );
    const mappedSignal: ThesisSignal = {
      id: responseID(signal.id, 'signal.id'),
      thesis_id: signalID,
      author_version_id: responseID(
        signal.author_version_id,
        'signal.author_version_id'
      ),
      statement_snapshot: responseNonemptyText(
        signal.statement_snapshot,
        'signal.statement_snapshot'
      ),
      stance: responseText(signal.stance, 'signal.stance'),
      explanation: responseText(signal.explanation, 'signal.explanation'),
      information_kind: responseText(
        signal.information_kind,
        'signal.information_kind'
      ),
      source: mappedSource,
    };
    if (signal.evidence_excerpt !== undefined) {
      if (!isRecord(signal.evidence_excerpt))
        throw invalidResponse('invalid evidence excerpt');
      mappedSignal.evidence_excerpt = {
        text: responseNonemptyText(
          signal.evidence_excerpt.text,
          'evidence_excerpt.text'
        ),
        omitted_before: responseBoolean(
          signal.evidence_excerpt.omitted_before,
          'evidence_excerpt.omitted_before'
        ),
        omitted_after: responseBoolean(
          signal.evidence_excerpt.omitted_after,
          'evidence_excerpt.omitted_after'
        ),
      };
    }
    return {
      feed_entry_id: responseID(raw.feed_entry_id, 'feed_entry_id'),
      cursor,
      signal: mappedSignal,
    };
  });
  const nextCursor = responseText(response.next_cursor, 'next_cursor');
  if (nextCursor && nextCursor !== entries[entries.length - 1]?.cursor) {
    throw invalidResponse('next_cursor must match the final entry');
  }
  return { research: status, entries, next_cursor: nextCursor };
}

function responseNonnegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidResponse(field + ' must be a nonnegative safe integer');
  }
  return value;
}

function responseNonemptyText(value: unknown, field: string): string {
  const valueText = responseText(value, field);
  if (!valueText.trim()) throw invalidResponse(field + ' must be nonempty');
  return valueText;
}

function requireRequestID(value: string): string {
  if (!UUID.test(value) || /^0{8}-0{4}-0{4}-0{4}-0{12}$/i.test(value)) {
    throw invalidArgument('request_id must be a non-zero RFC 4122 UUID');
  }
  return value;
}

function requireID(value: unknown, field: string): ThesisID {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw invalidArgument(`${field} must be a positive int64 decimal string`);
  }
  const parsed = BigInt(value);
  if (parsed > MAX_SIGNED_INT64) {
    throw invalidArgument(`${field} must be a positive int64 decimal string`);
  }
  return value;
}

function requireIDs(value: unknown, field: string): ThesisID[] {
  if (!Array.isArray(value)) throw invalidArgument(`${field} must be an array`);
  if (value.length > 20) {
    throw invalidArgument(`${field} must contain at most 20 IDs`);
  }
  return value.map((item, index) => requireID(item, `${field}[${index}]`));
}

function requireTickers(value: unknown): string[] {
  if (!Array.isArray(value)) throw invalidArgument('tickers must be an array');
  if (value.length > 100) {
    throw invalidArgument('tickers must contain at most 100 values');
  }
  return value.map((item, index) => {
    const ticker = requireText(item, `tickers[${index}]`);
    if (ticker.trim() === '' || ticker.includes('\0')) {
      throw invalidArgument(`tickers[${index}] must be non-empty`);
    }
    return ticker;
  });
}

function requireBody(value: string): string {
  const body = requireText(value, 'body');
  if (body.trim().length === 0) throw invalidArgument('body must not be blank');
  if (encoder.encode(body).byteLength > 65_536) {
    throw invalidArgument('body must be at most 65536 UTF-8 bytes');
  }
  return body;
}

function requireTitle(value: string): string {
  const title = requireText(value, 'title');
  if (encoder.encode(title).byteLength > 500) {
    throw invalidArgument('title must be at most 500 UTF-8 bytes');
  }
  return title;
}

function requireVisibility(value: string): ThesisVisibility {
  const visibility = requireText(value, 'visibility');
  if (visibility !== 'public' && visibility !== 'private') {
    throw invalidArgument('visibility must be public or private');
  }
  return visibility;
}

function requireRewriteMode(value: unknown): ThesisRewriteMode {
  const mode = requireText(value, 'mode');
  if (mode === 'reformat' || mode === 'shorten' || mode === 'enrich') {
    return mode;
  }
  throw invalidArgument('mode must be reformat, shorten, or enrich');
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string')
    throw invalidArgument(`${field} must be a string`);
  if (UNPAIRED_SURROGATE.test(value)) {
    throw invalidArgument(`${field} contains invalid Unicode`);
  }
  if (
    (field === 'body' || field === 'title' || field === 'note') &&
    value.includes('\0')
  ) {
    throw invalidArgument(`${field} must not contain NUL`);
  }
  return value;
}

function responseID(value: unknown, field: string): ThesisID {
  if (typeof value === 'number') {
    throw invalidResponse(
      `${field} must be a decimal string; numeric IDs are unsafe`
    );
  }
  try {
    return requireID(value, field);
  } catch {
    throw invalidResponse(`${field} must be a positive int64 decimal string`);
  }
}

function responseIDs(value: unknown, field: string): ThesisID[] {
  if (!Array.isArray(value)) throw invalidResponse(`${field} must be an array`);
  if (value.length > 20) {
    throw invalidResponse(`${field} must contain at most 20 IDs`);
  }
  return value.map((item, index) => responseID(item, `${field}[${index}]`));
}

function responseText(value: unknown, field: string): string {
  try {
    return requireText(value, field);
  } catch {
    throw invalidResponse(`${field} must be valid text`);
  }
}

function responseClosingNote(value: unknown): string {
  try {
    return requireText(value, 'note');
  } catch {
    throw invalidResponse('thesis.closing_note must be valid text');
  }
}

function responseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean')
    throw invalidResponse(`${field} must be boolean`);
  return value;
}

function responseVisibility(value: unknown): ThesisVisibility {
  try {
    return requireVisibility(value as string);
  } catch {
    throw invalidResponse('thesis.visibility must be public or private');
  }
}

function responseBody(value: unknown): string {
  try {
    return requireBody(value as string);
  } catch {
    throw invalidResponse(
      'response body must be nonblank valid text at most 65536 UTF-8 bytes'
    );
  }
}

function responseTitle(value: unknown): string {
  try {
    return requireTitle(value as string);
  } catch {
    throw invalidResponse(
      'response title must be valid text at most 500 UTF-8 bytes'
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidArgument(message: string): AlvaError {
  return new AlvaError('INVALID_ARGUMENT', message, 400);
}

function invalidResponse(message: string): AlvaError {
  return new AlvaError('INVALID_RESPONSE', message, 502);
}
