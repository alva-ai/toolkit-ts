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

export interface CreateThesisParams {
  /** Caller-supplied, stable non-zero UUID. Reuse it only to resolve ambiguity. */
  request_id: string;
  body: string;
  title?: string;
  entity_ids?: ThesisID[];
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

  async get(id: ThesisID): Promise<ThesisResponse> {
    this.client._requireAuth();
    return thesisResponse(
      await this.client._request('GET', `/api/v1/theses/${requireID(id, 'id')}`)
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

function createBody(params: CreateThesisParams): Required<CreateThesisParams> {
  return {
    request_id: requireRequestID(params.request_id),
    body: requireBody(params.body),
    title: requireTitle(params.title ?? ''),
    entity_ids: requireIDs(params.entity_ids ?? [], 'entity_ids'),
    visibility: requireVisibility(params.visibility ?? 'public'),
  };
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
    closing_note: responseText(thesis.closing_note, 'thesis.closing_note'),
    author_kind: responseText(thesis.author_kind, 'thesis.author_kind'),
    author_ref: responseText(thesis.author_ref, 'thesis.author_ref'),
  };
  return { thesis: value };
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
