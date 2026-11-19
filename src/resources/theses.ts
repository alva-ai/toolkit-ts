import {
  listTheses,
  relatedTheses,
  thesisReturn,
  thesisWatchpoints,
  type ListThesesParams,
  type ThesisPageParams,
  type ThesisReturnParams,
} from './thesisReads.js';
import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { v2Path, type Page } from '../platformApi.js';
import type { AlvaId } from '../types.js';
import {
  displayStance,
  isWireThesis,
  isWireThesisVersion,
  type WireProfile,
  type WireThesis,
  type WireThesisVersion,
} from './thesisPublication.js';

/** An ID of the Thesis domain (Thesis, ThesisVersion, Asset, Signal, Profile); opaque. */
export type ThesisID = AlvaId;
export type ThesisVisibility = 'public' | 'private' | 'paid';
/** unknown: not judged; none: judged without a current long or short. */
export type ThesisAssetStance = 'unknown' | 'bullish' | 'bearish' | 'none';
export interface ThesisEntityStance {
  entity_id: ThesisID;
  stance: ThesisAssetStance;
  /** Full direction in responses; stance reports none as unknown there. */
  direction?: ThesisAssetStance;
}
/** Direction, including NONE. */
export type ThesisDirection = 'UNKNOWN' | 'BULLISH' | 'BEARISH' | 'NONE';
export interface ThesisSelectedDirection {
  entityId: ThesisID;
  direction: ThesisDirection;
}
export type ThesisReturnTracking = 'UNSET' | 'ON' | 'OFF';
/** What publishing the selected entities with their directions would store. */
export interface ThesisReturnPreview {
  /** The Thesis's return switch now; UNSET for a new Thesis. */
  tracking: ThesisReturnTracking;
  /** Ask the author whether to keep the return on. */
  askSwitch: boolean;
  /** Directions publishing would store; UNKNOWN could not be judged. */
  directions: ThesisSelectedDirection[];
  /** Exits that keep the previous direction (last-leg rule). */
  keptEntityIds: ThesisID[];
  /** Publishing this draft fails with THESIS_RETURN_LAST_LEG. */
  lastLegRemoved: boolean;
}
export interface ThesisAssetCandidatesParams {
  /** Known catalog IDs to classify; with discover false, only these. */
  entityIds?: ThesisID[];
  /** The Thesis being updated: its current directions seed carried tickers. */
  thesisId?: ThesisID;
  /** False skips ticker discovery. Defaults to true. */
  discover?: boolean;
}
export interface ThesisAssetCandidate {
  entityId: ThesisID;
  ticker: string;
  name: string;
  kind: 'STOCK' | 'ETF' | 'CRYPTO' | 'INDEX' | 'COMMODITY' | 'UNKNOWN';
}
export interface ThesisAssetMention {
  quote: string;
  ticker: string;
  resolution: 'RESOLVED' | 'AMBIGUOUS' | 'UNRESOLVED';
  /** A suggested exit (NONE) reads UNKNOWN here, as display stances do. */
  stance: 'UNKNOWN' | 'BULLISH' | 'BEARISH';
  candidates: ThesisAssetCandidate[];
}
export interface ThesisAssetCandidatesResponse {
  mentions: ThesisAssetMention[];
  /** Null only from a server without the preview. */
  returnPreview: ThesisReturnPreview | null;
}
/** Canonical server-supported candidate rewrite operation. */
export type ThesisRewriteMode = 'reformat' | 'shorten' | 'enrich';

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
  /** alva_user or public_source; empty when the author's profile cannot be read. */
  author_kind: string;
  /** The author's Profile ID; empty when the profile cannot be read. */
  author_ref: string;
  archived: boolean;
  /** @deprecated Not returned: archiving is the Thesis's state (`archived`). */
  version_archived?: boolean;
  note?: string;
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
  /** Public images already uploaded with the existing upload tool, in display order. */
  images?: string[];
  /** Caller-supplied, stable non-zero UUID. Reuse it only to resolve ambiguity. */
  request_id: string;
  body: string;
  title?: string;
  entity_ids?: ThesisID[];
  /** Author direction keyed by an entity ID also supplied in entity_ids. */
  entity_stances?: ThesisEntityStance[];
  /** Exact STOCK ticker symbols resolved by Backend during creation. */
  tickers?: string[];
  /** Omitted means public, as defined by the REST contract. */
  visibility?: 'public' | 'private';
  /** Thesis return switch; omitted keeps the default (on). */
  track_return?: boolean;
}

export interface UpdateThesisParams {
  /** Full media replacement; pass current medias for a text-only update. */
  medias?: ThesisMedia[];
  /** Caller-supplied, stable non-zero UUID. Reuse it only to resolve ambiguity. */
  request_id: string;
  expected_author_version_id: ThesisID;
  body: string;
  title?: string;
  entity_ids?: ThesisID[];
  /** Full replacement: resubmit existing directions when only editing the body. */
  entity_stances?: ThesisEntityStance[];
  /**
   * Required so an update cannot inadvertently publish a private thesis; a
   * visibility that differs from the current one is applied first.
   */
  visibility: ThesisVisibility;
  /** false unarchives an archived Thesis with this Update; true is refused (use setArchived). */
  archived?: boolean;
  note?: string;
  /** Thesis return switch; omitted keeps the current decision or default. */
  track_return?: boolean;
}

export interface SetThesisArchivedParams {
  /** Caller-supplied, stable non-zero UUID for this archive transition. */
  request_id: string;
  archived: boolean;
  note?: string;
}

export interface ThesisStarredResponse {
  thesis_id: ThesisID;
  star_count: number;
  is_starred: boolean;
}

export interface ThesisSignalEnabledResponse {
  thesis_id: ThesisID;
  author_version_id: ThesisID;
  archived: boolean;
  research_paused: boolean;
  enabled: boolean;
}

export interface SetThesisVisibilityParams {
  visibility: 'public' | 'private';
}

export interface RewriteThesisParams {
  body: string;
  /** Omitted selects the canonical `reformat` mode. */
  mode?: ThesisRewriteMode;
}

export interface RewriteThesisResponse {
  body: string;
}

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

  /** One visible page; no automatic pagination or content truncation. */
  list(params: ListThesesParams) {
    return listTheses(this.client, params);
  }

  /** Related publications always use the current source version. */
  related(id: ThesisID, params: ThesisPageParams = {}) {
    return relatedTheses(this.client, id, params);
  }

  async assetCandidates(
    text: string,
    params: ThesisAssetCandidatesParams = {}
  ): Promise<ThesisAssetCandidatesResponse> {
    this.client._requireAuth();
    const source = requireBody(text);
    const input: Record<string, unknown> = {
      text: source,
      selectedAssetIds: requireIDs(params.entityIds ?? [], 'entityIds'),
    };
    if (params.thesisId !== undefined)
      input.thesisId = requireID(params.thesisId, 'thesisId');
    if (params.discover !== undefined) {
      if (typeof params.discover !== 'boolean')
        throw invalidArgument('discover must be a boolean');
      input.discover = params.discover;
    }
    const result = await this.client._v2Request<unknown>(
      'POST',
      '/thesis-asset-suggestions',
      { body: input }
    );
    if (!isRecord(result) || !Array.isArray(result.mentions)) {
      throw invalidResponse('asset candidates response must contain mentions');
    }
    const mentions = result.mentions.map((item, index) => {
      if (
        !isRecord(item) ||
        typeof item.quote !== 'string' ||
        typeof item.ticker !== 'string' ||
        !['RESOLVED', 'AMBIGUOUS', 'UNRESOLVED'].includes(
          item.resolution as string
        ) ||
        !THESIS_DIRECTIONS.includes(item.stance as string) ||
        !Array.isArray(item.candidates)
      ) {
        throw invalidResponse(`asset mention ${index} is invalid`);
      }
      const candidates = item.candidates.map((candidate: unknown) => {
        if (
          !isRecord(candidate) ||
          typeof candidate.symbol !== 'string' ||
          typeof candidate.name !== 'string' ||
          !CANDIDATE_KINDS.includes(candidate.kind as string)
        ) {
          throw invalidResponse(`asset mention ${index} has invalid candidate`);
        }
        return {
          entityId: responseID(
            candidate.assetId,
            `asset mention ${index} candidate.assetId`
          ),
          ticker: candidate.symbol,
          name: candidate.name,
          kind: candidate.kind as ThesisAssetCandidate['kind'],
        };
      });
      return {
        quote: item.quote,
        ticker: item.ticker,
        resolution: item.resolution as ThesisAssetMention['resolution'],
        stance: displayStance(
          item.stance as string
        ) as ThesisAssetMention['stance'],
        candidates,
      };
    });
    return { mentions, returnPreview: returnPreview(result.returnPreview) };
  }

  /** The Thesis return of a Thesis; detail revalues it. */
  thesisReturn(id: ThesisID, params: ThesisReturnParams = {}) {
    return thesisReturn(this.client, id, params);
  }

  /**
   * List every watchpoint of a Thesis (its current set, in number order): the
   * things the Thesis depends on, or that would show it right or wrong.
   */
  watchpoints(id: ThesisID) {
    return thesisWatchpoints(this.client, id);
  }

  async create(params: CreateThesisParams): Promise<ThesisResponse> {
    this.client._requireAuth();
    const { requestID, body } = createBody(params);
    return {
      thesis: thesisOf(
        await this.client._v2Request('POST', '/theses', {
          body,
          idempotencyKey: requestID,
        })
      ),
    };
  }

  async get(id: ThesisID): Promise<ThesisGetResponse> {
    this.client._requireAuth();
    const thesisID = requireID(id, 'id');
    const thesis = await this.read(thesisID);
    return {
      thesis: thesisOf(thesis),
      author: thesisAuthor(thesis.author),
      entities: thesis.currentVersion.assets.map((asset) => ({
        id: asset.assetId,
        ticker: asset.symbol ?? '',
        name: asset.name ?? '',
        icon_url: asset.logoUrl ?? '',
        kind: asset.kind ?? '',
      })),
    };
  }

  async getVersion(
    id: ThesisID,
    authorVersionID: ThesisID
  ): Promise<ThesisResponse> {
    this.client._requireAuth();
    const thesisID = requireID(id, 'id');
    const versionID = requireID(authorVersionID, 'author_version_id');
    const [thesis, version] = await Promise.all([
      this.read(thesisID),
      this.client._v2Request<unknown>(
        'GET',
        v2Path`/thesis-versions/${versionID}`
      ),
    ]);
    if (!isWireThesisVersion(version))
      throw invalidResponse('invalid Thesis version');
    if (version.thesisId !== thesisID || version.id !== versionID) {
      throw invalidResponse(
        'version response must match the requested thesis and author version'
      );
    }
    return { thesis: thesisOf(thesis, version) };
  }

  /** Lists reader-visible Updates, with editorial revisions folded together. */
  async listUpdates(
    id: ThesisID,
    params: { first?: number; cursor?: string } = {}
  ): Promise<{ versions: Thesis[]; next_cursor: string }> {
    this.client._requireAuth();
    const thesisID = requireID(id, 'id');
    const first = params.first ?? 10;
    if (!Number.isInteger(first) || first < 1 || first > 100)
      throw invalidArgument('first must be between 1 and 100');
    if (params.cursor !== undefined && typeof params.cursor !== 'string')
      throw invalidArgument('cursor must be a string');
    const [thesis, page] = await Promise.all([
      this.read(thesisID),
      this.client._v2Request<Page<unknown>>(
        'GET',
        v2Path`/theses/${thesisID}/updates`,
        { query: { pageSize: first, pageToken: params.cursor || undefined } }
      ),
    ]);
    if (!isRecord(page) || !Array.isArray(page.items))
      throw invalidResponse('invalid Update list');
    const versions = page.items.map((value) => {
      if (!isWireThesisVersion(value))
        throw invalidResponse('invalid Update list');
      if (value.thesisId !== thesisID)
        throw invalidResponse('Update list must match requested Thesis');
      return thesisOf(thesis, value);
    });
    return { versions, next_cursor: page.nextPageToken ?? '' };
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
    const thesisID = requireID(id, 'id');
    const [thesis, page] = await Promise.all([
      this.read(thesisID),
      this.client._v2Request<unknown>(
        'GET',
        v2Path`/theses/${thesisID}/signals`,
        { query: { pageSize: first, pageToken: params.cursor || undefined } }
      ),
    ]);
    return thesisSignalsResponse(thesis, page, thesisID, first);
  }

  /**
   * Publish an Update. `visibility` is applied first when it differs from the
   * current one; `archived: false` unarchives an archived Thesis (an Update
   * of its current content) before this Update. `request_id` is the
   * Idempotency-Key of the Update.
   */
  async update(
    id: ThesisID,
    params: UpdateThesisParams
  ): Promise<ThesisResponse> {
    this.client._requireAuth();
    const { requestID, body, visibility, archived } = updateBody(params);
    const thesisID = requireID(id, 'id');
    const current = await this.read(thesisID);
    if (current.visibility.toLowerCase() !== visibility) {
      await this.client._v2Request('PATCH', v2Path`/theses/${thesisID}`, {
        body: { visibility: visibility.toUpperCase() },
      });
    }
    if (archived === false && current.archived) {
      // An archived Thesis takes no Update: unarchiving publishes its current
      // content, and this Update follows from that version.
      const unarchived = readThesis(
        await this.client._v2Request(
          'POST',
          v2Path`/theses/${thesisID}/unarchive`,
          {
            body: {
              expectedVersionId: body.expectedVersionId,
              note: body.note,
            },
          }
        )
      );
      body.expectedVersionId = unarchived.currentVersion.id;
    }
    const response = thesisOf(
      await this.client._v2Request(
        'POST',
        v2Path`/theses/${thesisID}/updates`,
        { body, idempotencyKey: requestID }
      )
    );
    if (response.id !== thesisID) {
      throw invalidResponse('update response must match the requested thesis');
    }
    return { thesis: response };
  }

  /**
   * Archive or unarchive the current version without asking callers to resend
   * its body. Unarchiving publishes the current content as a new Update; an
   * archived Thesis takes no other Update.
   */
  async setArchived(
    id: ThesisID,
    params: SetThesisArchivedParams
  ): Promise<ThesisResponse> {
    this.client._requireAuth();
    if (!isRecord(params)) throw invalidArgument('params is required');
    const thesisID = requireID(id, 'id');
    const requestID = requireRequestID(params.request_id);
    if (typeof params.archived !== 'boolean') {
      throw invalidArgument('archived must be a boolean');
    }
    if (params.note !== undefined) requireText(params.note, 'note');

    const current = await this.read(thesisID);
    if (current.archived === params.archived && params.note === undefined) {
      return { thesis: thesisOf(current) };
    }
    const response = thesisOf(
      await this.client._v2Request(
        'POST',
        params.archived
          ? v2Path`/theses/${thesisID}/archive`
          : v2Path`/theses/${thesisID}/unarchive`,
        {
          body: {
            expectedVersionId: current.currentVersion.id,
            note: params.note,
          },
          idempotencyKey: requestID,
        }
      )
    );
    if (response.id !== thesisID || response.archived !== params.archived) {
      throw invalidResponse('archive response must match the requested state');
    }
    return { thesis: response };
  }

  async setStarred(
    id: ThesisID,
    isStarred: boolean
  ): Promise<ThesisStarredResponse> {
    this.client._requireAuth();
    const thesisID = requireID(id, 'id');
    if (typeof isStarred !== 'boolean') {
      throw invalidArgument('isStarred must be a boolean');
    }
    const result = await this.client._v2Request<unknown>(
      isStarred ? 'POST' : 'DELETE',
      isStarred
        ? '/me/followed-theses'
        : v2Path`/me/followed-theses/${thesisID}`,
      isStarred ? { body: { thesisId: thesisID } } : {}
    );
    if (!isRecord(result)) {
      throw invalidResponse('star response must contain the follow state');
    }
    const returnedID = responseID(result.thesisId, 'thesisId');
    if (returnedID !== thesisID) {
      throw invalidResponse('star response must match the requested thesis');
    }
    const starCount = result.followerCount;
    if (
      typeof starCount !== 'number' ||
      !Number.isInteger(starCount) ||
      starCount < 0
    ) {
      throw invalidResponse(
        'star response must contain a nonnegative star count'
      );
    }
    const returnedStarred = responseBoolean(result.following, 'following');
    if (returnedStarred !== isStarred) {
      throw invalidResponse('star response did not apply the requested state');
    }
    return {
      thesis_id: returnedID,
      star_count: starCount,
      is_starred: returnedStarred,
    };
  }

  async setSignalEnabled(
    id: ThesisID,
    enabled: boolean
  ): Promise<ThesisSignalEnabledResponse> {
    this.client._requireAuth();
    const thesisID = requireID(id, 'id');
    if (typeof enabled !== 'boolean') {
      throw invalidArgument('enabled must be a boolean');
    }
    const thesis = readThesis(
      await this.client._v2Request(
        'POST',
        enabled
          ? v2Path`/theses/${thesisID}/research/resume`
          : v2Path`/theses/${thesisID}/research/pause`
      )
    );
    if (thesis.id !== thesisID) {
      throw invalidResponse('Signal response must match the requested thesis');
    }
    const researchPaused = thesis.research.paused;
    if (researchPaused === enabled) {
      throw invalidResponse(
        'Signal response did not apply the requested state'
      );
    }
    return {
      thesis_id: thesis.id,
      author_version_id: thesis.currentVersion.id,
      archived: thesis.archived,
      research_paused: researchPaused,
      enabled: !researchPaused,
    };
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
    const visibility = requirePublicVisibility(params.visibility);
    const thesis = thesisOf(
      await this.client._v2Request('PATCH', v2Path`/theses/${thesisID}`, {
        body: { visibility: visibility.toUpperCase() },
      })
    );
    if (thesis.id !== thesisID || thesis.visibility !== visibility) {
      throw invalidResponse(
        'visibility response must match the requested thesis and visibility'
      );
    }
    return { thesis };
  }

  async rewrite(params: RewriteThesisParams): Promise<RewriteThesisResponse> {
    this.client._requireAuth();
    const body = requireBody(params.body);
    // Only omission selects the default. Empty, whitespace, null, and unknown
    // runtime values must remain visible validation failures.
    const mode =
      params.mode === undefined ? 'reformat' : requireRewriteMode(params.mode);
    const response = await this.client._v2Request<unknown>(
      'POST',
      '/thesis-rewrites',
      { body: { body, mode: mode.toUpperCase() } }
    );
    if (!isRecord(response) || typeof response.body !== 'string') {
      throw invalidResponse('rewrite response must contain a string body');
    }
    return { body: responseBody(response.body) };
  }

  /** The Thesis with its author and instruments; it must be the one asked for. */
  private async read(thesisID: ThesisID): Promise<WireThesis> {
    const thesis = readThesis(
      await this.client._v2Request('GET', v2Path`/theses/${thesisID}`)
    );
    if (thesis.id !== thesisID) {
      throw invalidResponse('get response must match the requested thesis');
    }
    return thesis;
  }
}

/** Validates a create request into its Idempotency-Key and /api/v2 body. */
function createBody(params: CreateThesisParams): {
  requestID: string;
  body: Record<string, unknown>;
} {
  const requestID = requireRequestID(params.request_id);
  const entityIDs = requireIDs(params.entity_ids ?? [], 'entity_ids');
  const visibility = requirePublicVisibility(params.visibility ?? 'public');
  const body: Record<string, unknown> = {
    title: requireTitle(params.title ?? ''),
    body: requireBody(params.body),
    visibility: visibility.toUpperCase(),
  };
  const stances =
    params.entity_stances === undefined
      ? []
      : requireEntityStances(params.entity_stances, entityIDs);
  body.assets = assetInputs(entityIDs, stances);
  if (params.images !== undefined) {
    if (!Array.isArray(params.images) || params.images.length > 20)
      throw invalidArgument('images must contain at most 20 URLs');
    if (params.images.length && visibility !== 'public')
      throw invalidArgument(
        'image publication currently requires public visibility'
      );
    body.media = params.images.map((url) => {
      if (!validMediaURL(url) || !url.startsWith('https://'))
        throw invalidArgument(
          'images must contain HTTPS URLs returned by the upload tool'
        );
      return { type: 'IMAGE', coverUrl: url, url };
    });
  }
  if (params.tickers !== undefined)
    body.tickers = requireTickers(params.tickers);
  if (params.track_return !== undefined)
    body.trackReturn = requireTrackReturn(params.track_return);
  return { requestID, body };
}

/** Each entity with its stance, UNKNOWN when the caller gave none. */
function assetInputs(
  entityIDs: ThesisID[],
  stances: ThesisEntityStance[]
): { assetId: ThesisID; stance: string }[] {
  const byEntity = new Map(stances.map((s) => [s.entity_id, s.stance]));
  return entityIDs.map((assetId) => ({
    assetId,
    stance: (byEntity.get(assetId) ?? 'unknown').toUpperCase(),
  }));
}

const ENTITY_STANCES: readonly string[] = [
  'unknown',
  'bullish',
  'bearish',
  'none',
];
const THESIS_DIRECTIONS: readonly string[] = [
  'UNKNOWN',
  'BULLISH',
  'BEARISH',
  'NONE',
];
const CANDIDATE_KINDS: readonly string[] = [
  'STOCK',
  'ETF',
  'CRYPTO',
  'INDEX',
  'COMMODITY',
  'UNKNOWN',
];
const RETURN_TRACKING: readonly string[] = ['UNSET', 'ON', 'OFF'];

function requireTrackReturn(value: unknown): boolean {
  if (typeof value !== 'boolean')
    throw invalidArgument('track_return must be a boolean');
  return value;
}

function selectedDirections(
  value: unknown,
  field: string
): ThesisSelectedDirection[] {
  if (!Array.isArray(value)) throw invalidResponse(`${field} must be an array`);
  return value.map((item: unknown, index) => {
    if (!isRecord(item) || !THESIS_DIRECTIONS.includes(item.stance as string))
      throw invalidResponse(`${field}[${index}] is invalid`);
    return {
      entityId: responseID(item.assetId, `${field}[${index}].assetId`),
      direction: item.stance as ThesisDirection,
    };
  });
}

function returnPreview(value: unknown): ThesisReturnPreview | null {
  if (value === null || value === undefined) return null;
  if (
    !isRecord(value) ||
    !RETURN_TRACKING.includes(value.tracking as string) ||
    typeof value.askSwitch !== 'boolean' ||
    typeof value.lastLegRemoved !== 'boolean' ||
    !Array.isArray(value.keptAssetIds)
  )
    throw invalidResponse('returnPreview is invalid');
  return {
    tracking: value.tracking as ThesisReturnTracking,
    askSwitch: value.askSwitch,
    directions: selectedDirections(value.stances, 'returnPreview.stances'),
    keptEntityIds: value.keptAssetIds.map((id: unknown, index) =>
      responseID(id, `returnPreview.keptAssetIds[${index}]`)
    ),
    lastLegRemoved: value.lastLegRemoved,
  };
}

function requireEntityStances(
  value: unknown,
  entityIDs: ThesisID[]
): ThesisEntityStance[] {
  if (!Array.isArray(value) || value.length > MAX_ENTITY_IDS)
    throw invalidArgument('entity_stances must contain at most 100 values');
  const allowed = new Set(entityIDs);
  const seen = new Set<string>();
  return value.map((item, index) => {
    if (!isRecord(item))
      throw invalidArgument(`entity_stances[${index}] must be an object`);
    const entityID = requireID(
      item.entity_id,
      `entity_stances[${index}].entity_id`
    );
    if (!allowed.has(entityID) || seen.has(entityID))
      throw invalidArgument(
        'entity stance must reference one unique entity_id'
      );
    seen.add(entityID);
    if (!ENTITY_STANCES.includes(item.stance as string))
      throw invalidArgument(`entity_stances[${index}].stance is invalid`);
    return { entity_id: entityID, stance: item.stance as ThesisAssetStance };
  });
}

/**
 * Validates an update into its Idempotency-Key, the Update body, and the
 * visibility and archive state it asks for.
 */
function updateBody(params: UpdateThesisParams): {
  requestID: string;
  body: Record<string, unknown> & { expectedVersionId: ThesisID };
  visibility: ThesisVisibility;
  archived: boolean | undefined;
} {
  const requestID = requireRequestID(params.request_id);
  const entityIDs = requireIDs(params.entity_ids ?? [], 'entity_ids');
  const body: Record<string, unknown> & { expectedVersionId: ThesisID } = {
    expectedVersionId: requireID(
      params.expected_author_version_id,
      'expected_author_version_id'
    ),
    title: requireTitle(params.title ?? ''),
    body: requireBody(params.body),
  };
  const visibility = requireVisibility(params.visibility);
  const stances =
    params.entity_stances === undefined
      ? []
      : requireEntityStances(params.entity_stances, entityIDs);
  body.assets = assetInputs(entityIDs, stances);
  // Full replacement, as in 0.x: omitted medias clear the Update's media
  // (/api/v2 would carry them over).
  const medias = params.medias ?? [];
  if (!Array.isArray(medias) || medias.length > 20)
    throw invalidArgument('medias must be an array of at most 20 items');
  if (!medias.every(validMedia))
    throw invalidArgument('medias contains invalid media');
  body.media = medias.map((m) => ({
    type: m.type.toUpperCase(),
    coverUrl: m.cover_url,
    url: m.url ?? null,
  }));
  if (params.archived !== undefined) {
    if (typeof params.archived !== 'boolean')
      throw invalidArgument('archived must be a boolean');
    if (params.archived)
      throw invalidArgument(
        'archived: true is not an Update; archive with setArchived'
      );
  }
  if (params.note !== undefined) body.note = requireText(params.note, 'note');
  if (params.track_return !== undefined)
    body.trackReturn = requireTrackReturn(params.track_return);
  return { requestID, body, visibility, archived: params.archived };
}

/** Reads a Thesis response; its author may be null (an unreadable profile). */
function readThesis(value: unknown): WireThesis {
  if (!isWireThesis(value))
    throw invalidResponse('response must contain thesis');
  return value;
}

/**
 * The REST shape of a Thesis at `version` (its current version by default):
 * the version's content with the Thesis's state.
 */
function thesisOf(value: unknown, version?: WireThesisVersion): Thesis {
  const thesis = readThesis(value);
  const v = version ?? thesis.currentVersion;
  if (v.assets.length > MAX_ENTITY_IDS) {
    throw invalidResponse(
      `thesis.entity_ids must contain at most ${MAX_ENTITY_IDS} IDs`
    );
  }
  const medias = v.media.map((m) => ({
    type: m.type.toLowerCase() as ThesisMedia['type'],
    cover_url: m.coverUrl,
    ...(m.url === null ? {} : { url: m.url }),
  }));
  if (medias.length > 20 || !medias.every(validMedia))
    throw invalidResponse('thesis.medias contains invalid media');
  const author = thesis.author;
  return {
    id: thesis.id,
    author_version_id: v.id,
    material_version_id: v.materialVersionId,
    title: responseTitle(v.title),
    body: responseBody(v.body),
    entity_ids: v.assets.map((a) => a.assetId),
    entity_stances: v.assets.map((a) => ({
      entity_id: a.assetId,
      stance: displayStance(a.stance).toLowerCase() as ThesisAssetStance,
      direction: a.stance.toLowerCase() as ThesisAssetStance,
    })),
    visibility: responseVisibility(thesis.visibility.toLowerCase()),
    medias,
    closed: thesis.closed,
    closing_note: responseClosingNote(thesis.closingNote ?? ''),
    author_kind:
      author === null
        ? ''
        : author.kind === 'USER'
          ? 'alva_user'
          : 'public_source',
    author_ref: author?.id ?? '',
    archived: thesis.archived,
    note: responseText(v.note ?? '', 'thesis.note'),
  };
}

function thesisAuthor(author: WireProfile | null): ThesisAuthor {
  if (author === null) {
    return { id: '', kind: '', display_name: '', avatar_url: '', username: '' };
  }
  return {
    id: author.id,
    kind: author.kind.toLowerCase(),
    display_name: author.displayName,
    avatar_url: author.avatarUrl ?? '',
    username: author.handle,
  };
}

function thesisSignalsResponse(
  thesis: WireThesis,
  page: unknown,
  thesisID: ThesisID,
  first: number
): ThesisSignalsResponse {
  if (
    !isRecord(page) ||
    !Array.isArray(page.items) ||
    page.items.length > first ||
    !(page.nextPageToken === null || typeof page.nextPageToken === 'string')
  ) {
    throw invalidResponse('invalid Signal history response');
  }
  const research = thesis.research;
  const status: ThesisResearchStatus = {
    state: research.state.toLowerCase(),
    pending_work: responseNonnegativeInteger(
      research.pendingWork,
      'research.pendingWork'
    ),
    read_complete: research.readComplete,
  };
  if (research.lastAttemptAt !== null)
    status.last_attempt_ms = Date.parse(research.lastAttemptAt);
  if (research.lastCompletedAt !== null)
    status.last_completed_ms = Date.parse(research.lastCompletedAt);

  const nextCursor = (page.nextPageToken as string | null) ?? '';
  const last = page.items.length - 1;
  const entries = page.items.map((signal, index): ThesisSignalEntry => {
    if (!isRecord(signal) || !isRecord(signal.source)) {
      throw invalidResponse('entry must include a Signal and source');
    }
    const source = signal.source;
    const signalThesis = responseID(signal.thesisId, 'signal.thesisId');
    if (signalThesis !== thesisID)
      throw invalidResponse('Signal belongs to another Thesis');
    const mappedSource: ThesisSignalSource = {
      title: responseText(source.title, 'source.title'),
    };
    if (source.url !== null)
      mappedSource.url = responseText(source.url, 'source.url');
    if (source.publishedAt !== null)
      mappedSource.published_at_ms = Date.parse(
        responseText(source.publishedAt, 'source.publishedAt')
      );
    const signalID = responseID(signal.id, 'signal.id');
    const mappedSignal: ThesisSignal = {
      id: signalID,
      thesis_id: signalThesis,
      author_version_id: responseID(signal.versionId, 'signal.versionId'),
      statement_snapshot: responseNonemptyText(
        signal.statement,
        'signal.statement'
      ),
      stance: responseText(signal.stance, 'signal.stance').toLowerCase(),
      explanation: responseText(signal.explanation, 'signal.explanation'),
      information_kind: responseText(
        signal.informationKind,
        'signal.informationKind'
      ),
      source: mappedSource,
    };
    if (signal.evidence !== null) {
      mappedSignal.evidence_excerpt = {
        text: responseNonemptyText(signal.evidence, 'signal.evidence'),
        omitted_before: false,
        omitted_after: false,
      };
    }
    return {
      feed_entry_id: signalID,
      cursor: index === last ? nextCursor : '',
      signal: mappedSignal,
    };
  });
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
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    value.trim() !== value
  ) {
    throw invalidArgument(`${field} must be an ID`);
  }
  return value;
}

// MAX_ENTITY_IDS matches Backend's thesis.MaxEntities: a Thesis version carries
// at most 100 canonical entities, the same as the ticker limit.
const MAX_ENTITY_IDS = 100;

function requireIDs(value: unknown, field: string): ThesisID[] {
  if (!Array.isArray(value)) throw invalidArgument(`${field} must be an array`);
  if (value.length > MAX_ENTITY_IDS) {
    throw invalidArgument(
      `${field} must contain at most ${MAX_ENTITY_IDS} IDs`
    );
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
  if (
    visibility !== 'public' &&
    visibility !== 'private' &&
    visibility !== 'paid'
  ) {
    throw invalidArgument('visibility must be public, private or paid');
  }
  return visibility;
}

function requirePublicVisibility(value: string): 'public' | 'private' {
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
  try {
    return requireID(value, field);
  } catch {
    throw invalidResponse(`${field} must be an ID`);
  }
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
    throw invalidResponse('thesis.visibility must be public, private or paid');
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
