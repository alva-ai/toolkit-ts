import { AlvaError } from '../error.js';

// The /api/v1 REST Thesis, as GET /api/v1/me/following/theses returns it. The
// following feed is the one Thesis read without an /api/v2 route: its cursor
// is a lasting resume point ("read only what is new next time"), which a
// sealed /api/v2 page token, valid for 24 hours, cannot replace. This module
// goes when the feed has an /api/v2 home; every other Thesis read uses the
// /api/v2 shape (theses.ts).

export type ThesisID = string;
export type ThesisVisibility = 'public' | 'private' | 'paid';
/** unknown: not judged; none: judged without a current long or short. */
export type ThesisAssetStance = 'unknown' | 'bullish' | 'bearish' | 'none';
export interface ThesisEntityStance {
  entity_id: ThesisID;
  stance: ThesisAssetStance;
  /** Full direction in responses; stance reports none as unknown there. */
  direction?: ThesisAssetStance;
}

export interface ThesisMedia {
  type: 'image' | 'price_chart' | 'audio' | 'video';
  cover_url: string;
  url?: string | null;
}

export interface Thesis {
  id: ThesisID;
  author_version_id: ThesisID;
  material_version_id: ThesisID;
  title: string;
  body: string;
  entity_ids: ThesisID[];
  entity_stances?: ThesisEntityStance[];
  visibility: ThesisVisibility;
  medias?: ThesisMedia[];
  closed: boolean;
  closing_note: string;
  author_kind: string;
  author_ref: string;
  archived: boolean;
  version_archived?: boolean;
  note?: string;
  /** `initial` for a Thesis's first publication, `material` for an Update. */
  change_kind?: string;
}

const MAX_SIGNED_INT64 = 9_223_372_036_854_775_807n;
// Backend's thesis.MaxEntities: a Thesis version carries at most 100 entities.
const MAX_ENTITY_IDS = 100;
const ENTITY_STANCES: readonly string[] = [
  'unknown',
  'bullish',
  'bearish',
  'none',
];
const UNPAIRED_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const encoder = new TextEncoder();

/** One /api/v1 REST thesis object, validated. */
export function parseThesisREST(thesis: unknown): Thesis {
  if (!isRecord(thesis)) throw invalidResponse('response must contain thesis');
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
    title: responseText(thesis.title, 'thesis.title', {
      maxBytes: 500,
      noNUL: true,
    }),
    body: responseBody(thesis.body),
    entity_ids: responseIDs(thesis.entity_ids, 'thesis.entity_ids'),
    visibility: responseVisibility(thesis.visibility),
    closed: responseBoolean(thesis.closed, 'thesis.closed'),
    archived: responseBoolean(thesis.archived, 'thesis.archived'),
    closing_note: responseText(thesis.closing_note, 'thesis.closing_note', {
      noNUL: true,
    }),
    author_kind: responseText(thesis.author_kind, 'thesis.author_kind'),
    author_ref: responseText(thesis.author_ref, 'thesis.author_ref'),
  };
  if (thesis.medias !== undefined) {
    if (!Array.isArray(thesis.medias) || thesis.medias.length > 20)
      throw invalidResponse('thesis.medias must contain at most 20 items');
    value.medias = thesis.medias.map((item: unknown) => {
      if (!validMedia(item))
        throw invalidResponse('thesis.medias contains invalid media');
      return {
        type: item.type as ThesisMedia['type'],
        cover_url: item.cover_url as string,
        ...(item.url === undefined ? {} : { url: item.url as string | null }),
      };
    });
  }
  if (thesis.version_archived !== undefined)
    value.version_archived = responseBoolean(
      thesis.version_archived,
      'thesis.version_archived'
    );
  if (thesis.note !== undefined)
    value.note = responseText(thesis.note, 'thesis.note');
  if (thesis.change_kind !== undefined)
    value.change_kind = responseText(thesis.change_kind, 'thesis.change_kind');
  if (thesis.entity_stances !== undefined) {
    if (!Array.isArray(thesis.entity_stances))
      throw invalidResponse('thesis.entity_stances must be an array');
    value.entity_stances = thesis.entity_stances.map((item: unknown) => {
      if (!isRecord(item))
        throw invalidResponse('thesis.entity_stances contains invalid entry');
      const entityID = responseID(item.entity_id, 'entity_stances.entity_id');
      if (!value.entity_ids.includes(entityID))
        throw invalidResponse('entity stance must reference a thesis entity');
      if (!ENTITY_STANCES.includes(item.stance as string))
        throw invalidResponse('thesis.entity_stances contains invalid stance');
      const stance: ThesisEntityStance = {
        entity_id: entityID,
        stance: item.stance as ThesisAssetStance,
      };
      if (item.direction !== undefined) {
        if (!ENTITY_STANCES.includes(item.direction as string))
          throw invalidResponse(
            'thesis.entity_stances contains invalid direction'
          );
        stance.direction = item.direction as ThesisAssetStance;
      }
      return stance;
    });
  }
  return value;
}

function responseID(value: unknown, field: string): ThesisID {
  if (typeof value === 'number') {
    throw invalidResponse(
      `${field} must be a decimal string; numeric IDs are unsafe`
    );
  }
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value) ||
    BigInt(value) > MAX_SIGNED_INT64
  ) {
    throw invalidResponse(`${field} must be a positive int64 decimal string`);
  }
  return value;
}

function responseIDs(value: unknown, field: string): ThesisID[] {
  if (!Array.isArray(value)) throw invalidResponse(`${field} must be an array`);
  if (value.length > MAX_ENTITY_IDS) {
    throw invalidResponse(
      `${field} must contain at most ${MAX_ENTITY_IDS} IDs`
    );
  }
  return value.map((item, index) => responseID(item, `${field}[${index}]`));
}

/** Text without unpaired surrogates; title, body and closing note also without NUL. */
function responseText(
  value: unknown,
  field: string,
  limits: { maxBytes?: number; noNUL?: boolean } = {}
): string {
  if (
    typeof value !== 'string' ||
    UNPAIRED_SURROGATE.test(value) ||
    (limits.noNUL && value.includes('\0')) ||
    (limits.maxBytes !== undefined &&
      encoder.encode(value).byteLength > limits.maxBytes)
  ) {
    throw invalidResponse(`${field} must be valid text`);
  }
  return value;
}

function responseBody(value: unknown): string {
  const body = responseText(value, 'thesis.body', {
    maxBytes: 65_536,
    noNUL: true,
  });
  if (body.trim().length === 0)
    throw invalidResponse(
      'response body must be nonblank valid text at most 65536 UTF-8 bytes'
    );
  return body;
}

function responseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean')
    throw invalidResponse(`${field} must be boolean`);
  return value;
}

function responseVisibility(value: unknown): ThesisVisibility {
  if (value !== 'public' && value !== 'private' && value !== 'paid')
    throw invalidResponse('thesis.visibility must be public, private or paid');
  return value;
}

function validMedia(item: unknown): item is ThesisMedia {
  return (
    isRecord(item) &&
    ['image', 'price_chart', 'audio', 'video'].includes(item.type as string) &&
    validMediaURL(item.cover_url) &&
    (item.url == null || validMediaURL(item.url))
  );
}

function validMediaURL(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    /[\s\u0000]/.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidResponse(message: string): AlvaError {
  return new AlvaError('INVALID_RESPONSE', message, 502);
}
