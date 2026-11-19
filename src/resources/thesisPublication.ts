/**
 * The Thesis contract shared by every read that renders one: the /api/v2
 * Thesis, and the publication summary the For You stream and the author,
 * asset and Related reads build from it.
 */
import { AlvaError } from '../error.js';
import type { AlvaId } from '../types.js';

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An instrument of a Thesis version and the author's direction. */
export interface WireThesisAsset {
  assetId: AlvaId;
  /** UNKNOWN, BULLISH, BEARISH or NONE. */
  stance: string;
  symbol: string | null;
  name: string | null;
  logoUrl: string | null;
  kind: string | null;
}

export interface WireThesisVersion {
  id: AlvaId;
  thesisId: AlvaId;
  materialVersionId: AlvaId;
  changeKind: string;
  publishedAt: string;
  title: string;
  body: string;
  note: string | null;
  assets: WireThesisAsset[];
  categoryIds: AlvaId[];
  media: { type: string; coverUrl: string; url: string | null }[];
  sources: {
    title: string | null;
    kind: string;
    contentKey: string;
    url: string | null;
    publishedAt: string | null;
    locator: string | null;
  }[];
}

export interface WireProfile {
  id: AlvaId;
  /** USER or PERSON. */
  kind: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  followerCount: number;
  viewerState: { following: boolean | null };
}

/** A Thesis as /api/v2 returns it. */
export interface WireThesis {
  id: AlvaId;
  playbookId: AlvaId;
  author: WireProfile | null;
  visibility: string;
  archived: boolean;
  closed: boolean;
  closingNote: string | null;
  research: {
    state: string;
    paused: boolean;
    pendingWork: number;
    readComplete: boolean;
    lastAttemptAt: string | null;
    lastCompletedAt: string | null;
  };
  signalAutomationId: AlvaId | null;
  currentVersion: WireThesisVersion;
}

/**
 * The canonical viewpoint author. `__typename` names the exact handle that
 * `thesis list` accepts: a Person's `slug` or a PublicUser's `username`.
 */
export type ThesisPublisher = {
  /** Profile ID. */
  id: AlvaId;
  displayName: string;
  avatarUrl: string;
  bio: string;
  followersCount: number;
  viewerState: { following: boolean | null };
} & (
  | { __typename: 'Person'; slug: string }
  | { __typename: 'PublicUser'; username: string }
);

export interface ThesisSourceReference {
  title: string | null;
  sourceKind: string;
  sourceContentId: string;
  publicUrl: string;
  sourceTimeMs: number | null;
  locator: string;
}

/** The exact author version this recommendation renders, not the mutable Thesis. */
export interface ThesisPublicationSummary {
  thesisId: AlvaId;
  /** Playbook ID of the Playbook that carries the Thesis. */
  playbookId: AlvaId;
  authorVersionId: AlvaId;
  materialVersionId: AlvaId;
  itemKey: string;
  title: string;
  body: string;
  publishedAtMs: number;
  changeKind: string;
  visibility: string;
  closed: boolean;
  archived: boolean;
  note: string;
  closingNote: string;
  researchPaused: boolean;
  entityIds: AlvaId[];
  categoryIds: AlvaId[];
  /** `stance` is UNKNOWN, BULLISH or BEARISH today; Gateway may add values. */
  entityStances: { entityId: AlvaId; stance: string }[];
  entities: { id: AlvaId; ticker: string; name: string }[];
  publisher: ThesisPublisher;
  /** `type` is PRICE_CHART, IMAGE, AUDIO or VIDEO today; Gateway may add values. */
  medias: { type: string; coverUrl: string; url: string | null }[];
  signalFeed: { id: AlvaId } | null;
  snapshotRelease: {
    versionId: AlvaId;
    materialVersionId: AlvaId;
    publishedAtMs: number;
    changeKind: string;
    sourceRefs: ThesisSourceReference[];
  };
}

/** A stance that reads NONE (a judged absence) as UNKNOWN, as display stances do. */
export function displayStance(stance: string): string {
  return stance === 'NONE' ? 'UNKNOWN' : stance;
}

/** An RFC 3339 instant in epoch milliseconds; null when absent. */
export function epochMs(value: string | null | undefined): number | null {
  return value ? Date.parse(value) : null;
}

/**
 * Builds the publication summary of a Thesis. `itemKey` is the list position
 * key; `authorVersionId` is the version the list was built with, the current
 * one when omitted.
 */
export function publicationSummary(
  thesis: WireThesis,
  itemKey: string,
  authorVersionId?: AlvaId
): ThesisPublicationSummary {
  const v = thesis.currentVersion;
  const author = thesis.author as WireProfile;
  const publishedAtMs = Date.parse(v.publishedAt);
  const changeKind = v.changeKind.toLowerCase();
  const handle =
    author.kind === 'USER'
      ? { __typename: 'PublicUser' as const, username: author.handle }
      : { __typename: 'Person' as const, slug: author.handle };
  return {
    thesisId: thesis.id,
    playbookId: thesis.playbookId,
    authorVersionId: authorVersionId ?? v.id,
    materialVersionId: v.materialVersionId,
    itemKey,
    title: v.title,
    body: v.body,
    publishedAtMs,
    changeKind,
    visibility: thesis.visibility.toLowerCase(),
    closed: thesis.closed,
    archived: thesis.archived,
    note: v.note ?? '',
    closingNote: thesis.closingNote ?? '',
    researchPaused: thesis.research.paused,
    entityIds: v.assets.map((a) => a.assetId),
    categoryIds: v.categoryIds,
    entityStances: v.assets.map((a) => ({
      entityId: a.assetId,
      stance: displayStance(a.stance),
    })),
    entities: v.assets.map((a) => ({
      id: a.assetId,
      ticker: a.symbol ?? '',
      name: a.name ?? '',
    })),
    publisher: {
      ...handle,
      id: author.id,
      displayName: author.displayName,
      avatarUrl: author.avatarUrl ?? '',
      bio: author.bio ?? '',
      followersCount: author.followerCount,
      viewerState: { following: author.viewerState.following },
    },
    medias: v.media.map((m) => ({
      type: m.type,
      coverUrl: m.coverUrl,
      url: m.url,
    })),
    signalFeed:
      thesis.signalAutomationId === null
        ? null
        : { id: thesis.signalAutomationId },
    snapshotRelease: {
      versionId: v.id,
      materialVersionId: v.materialVersionId,
      publishedAtMs,
      changeKind,
      sourceRefs: v.sources.map((s) => ({
        title: s.title,
        sourceKind: s.kind,
        sourceContentId: s.contentKey,
        publicUrl: s.url ?? '',
        sourceTimeMs: epochMs(s.publishedAt),
        locator: s.locator ?? '',
      })),
    },
  };
}

/**
 * Checks a Thesis's version against the contract before it is mapped, so a
 * malformed response fails closed rather than leaking `undefined` into a
 * public type.
 */
export function isWireThesisVersion(
  value: unknown
): value is WireThesisVersion {
  return (
    record(value) &&
    nonempty(value.id) &&
    nonempty(value.thesisId) &&
    nonempty(value.materialVersionId) &&
    nonempty(value.changeKind) &&
    instant(value.publishedAt) &&
    typeof value.title === 'string' &&
    typeof value.body === 'string' &&
    nullable(value.note, 'string') &&
    Array.isArray(value.assets) &&
    value.assets.every(
      (a: unknown) =>
        record(a) &&
        nonempty(a.assetId) &&
        nonempty(a.stance) &&
        nullable(a.symbol, 'string') &&
        nullable(a.name, 'string') &&
        nullable(a.logoUrl, 'string') &&
        nullable(a.kind, 'string')
    ) &&
    Array.isArray(value.categoryIds) &&
    value.categoryIds.every(nonempty) &&
    Array.isArray(value.media) &&
    value.media.every(
      (m: unknown) =>
        record(m) &&
        nonempty(m.type) &&
        typeof m.coverUrl === 'string' &&
        nullable(m.url, 'string')
    ) &&
    Array.isArray(value.sources) &&
    value.sources.every(
      (s: unknown) =>
        record(s) &&
        nullable(s.title, 'string') &&
        typeof s.kind === 'string' &&
        typeof s.contentKey === 'string' &&
        nullable(s.url, 'string') &&
        (s.publishedAt === null || instant(s.publishedAt)) &&
        nullable(s.locator, 'string')
    )
  );
}

/** Checks a Thesis, its research state and its current version. */
export function isWireThesis(value: unknown): value is WireThesis {
  if (
    !record(value) ||
    !nonempty(value.id) ||
    !nonempty(value.playbookId) ||
    !nonempty(value.visibility) ||
    typeof value.archived !== 'boolean' ||
    typeof value.closed !== 'boolean' ||
    !nullable(value.closingNote, 'string') ||
    !(value.signalAutomationId === null || nonempty(value.signalAutomationId))
  )
    return false;
  const research = value.research;
  if (
    !record(research) ||
    typeof research.state !== 'string' ||
    typeof research.paused !== 'boolean' ||
    typeof research.pendingWork !== 'number' ||
    typeof research.readComplete !== 'boolean' ||
    !(research.lastAttemptAt === null || instant(research.lastAttemptAt)) ||
    !(research.lastCompletedAt === null || instant(research.lastCompletedAt))
  )
    return false;
  if (value.author !== null && !isWireProfile(value.author)) return false;
  return (
    isWireThesisVersion(value.currentVersion) &&
    value.currentVersion.thesisId === value.id
  );
}

export function isWireProfile(value: unknown): value is WireProfile {
  return (
    record(value) &&
    nonempty(value.id) &&
    (value.kind === 'USER' || value.kind === 'PERSON') &&
    typeof value.handle === 'string' &&
    typeof value.displayName === 'string' &&
    nullable(value.avatarUrl, 'string') &&
    nullable(value.bio, 'string') &&
    typeof value.followerCount === 'number' &&
    record(value.viewerState) &&
    nullable(value.viewerState.following, 'boolean')
  );
}

/**
 * Reads a Thesis a publication is built from: a malformed Thesis, or one
 * whose author cannot be read, is INVALID_RESPONSE.
 */
export function publishedThesis(value: unknown): WireThesis {
  if (!isWireThesis(value) || value.author === null) {
    throw invalidThesisResponse();
  }
  return value;
}

export function invalidThesisResponse(): AlvaError {
  return new AlvaError('INVALID_RESPONSE', 'Invalid Thesis read response', 502);
}

export function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function nullable(value: unknown, type: 'string' | 'boolean'): boolean {
  return value === null || typeof value === type;
}

function instant(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
