/**
 * The Thesis publication contract shared by every read that renders one: the
 * For You recommendation stream and explicit author, entity and Related reads.
 */

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPositiveInt64(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[1-9]\d{0,18}$/.test(value) &&
    BigInt(value) <= 9223372036854775807n
  );
}

/**
 * The canonical viewpoint author. `__typename` names the exact handle that
 * `thesis list` accepts: a Person's `slug` or a PublicUser's `username`.
 */
export type ThesisPublisher = {
  id: string;
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
  thesisId: string;
  playbookId: string;
  authorVersionId: string;
  materialVersionId: string;
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
  entityIds: string[];
  categoryIds: string[];
  /** `stance` is UNKNOWN, BULLISH or BEARISH today; Gateway may add values. */
  entityStances: { entityId: string; stance: string }[];
  entities: { id: string; ticker: string; name: string }[];
  publisher: ThesisPublisher;
  /** `type` is PRICE_CHART, IMAGE, AUDIO or VIDEO today; Gateway may add values. */
  medias: { type: string; coverUrl: string; url: string | null }[];
  signalFeed: { id: string } | null;
  snapshotRelease: {
    versionId: string;
    materialVersionId: string;
    publishedAtMs: number;
    changeKind: string;
    sourceRefs: ThesisSourceReference[];
  };
}

/** Immutable publication projection selected by every Thesis publication read. */
export const THESIS_PUBLICATION_FIELDS = `
            thesisId playbookId authorVersionId materialVersionId itemKey
            title body publishedAtMs changeKind visibility
            closed archived note closingNote researchPaused
            entityIds categoryIds
            entityStances { entityId stance }
            entities { id ticker name }
            publisher {
              __typename id displayName avatarUrl bio followersCount
              viewerState { following }
              ... on Person { slug }
              ... on PublicUser { username }
            }
            medias { type coverUrl url }
            signalFeed { id }
            snapshotRelease {
              versionId materialVersionId publishedAtMs changeKind
              sourceRefs {
                title sourceKind sourceContentId publicUrl sourceTimeMs locator
              }
            }
`;

function positiveInt64List(value: unknown): boolean {
  return Array.isArray(value) && value.every(isPositiveInt64);
}

function stanceList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (item: unknown) =>
        record(item) &&
        isPositiveInt64(item.entityId) &&
        typeof item.stance === 'string' &&
        item.stance.trim() !== ''
    )
  );
}

function entityList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (item: unknown) =>
        record(item) &&
        typeof item.id === 'string' &&
        item.id.trim() !== '' &&
        typeof item.ticker === 'string' &&
        typeof item.name === 'string'
    )
  );
}

function mediaList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (item: unknown) =>
        record(item) &&
        typeof item.type === 'string' &&
        item.type.trim() !== '' &&
        typeof item.coverUrl === 'string' &&
        (item.url === null || typeof item.url === 'string')
    )
  );
}

function sourceRefList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (item: unknown) =>
        record(item) &&
        (item.title === null || typeof item.title === 'string') &&
        typeof item.sourceKind === 'string' &&
        typeof item.sourceContentId === 'string' &&
        typeof item.publicUrl === 'string' &&
        nullableMs(item.sourceTimeMs) &&
        typeof item.locator === 'string'
    )
  );
}

function nullableMs(value: unknown): boolean {
  return (
    value === null || (typeof value === 'number' && Number.isFinite(value))
  );
}

/** Every field the public type promises on the immutable version payload. */
function snapshot(value: unknown): boolean {
  return (
    record(value) &&
    isPositiveInt64(value.versionId) &&
    isPositiveInt64(value.materialVersionId) &&
    typeof value.publishedAtMs === 'number' &&
    Number.isFinite(value.publishedAtMs) &&
    typeof value.changeKind === 'string' &&
    value.changeKind.trim() !== '' &&
    sourceRefList(value.sourceRefs)
  );
}

/** Preserve publisher IDs as strings; the kind selects the author handle. */
function publisher(value: unknown): boolean {
  return (
    record(value) &&
    ((value.__typename === 'Person' && typeof value.slug === 'string') ||
      (value.__typename === 'PublicUser' &&
        typeof value.username === 'string')) &&
    typeof value.id === 'string' &&
    value.id.trim() !== '' &&
    typeof value.displayName === 'string' &&
    typeof value.avatarUrl === 'string' &&
    typeof value.bio === 'string' &&
    typeof value.followersCount === 'number' &&
    Number.isInteger(value.followersCount) &&
    record(value.viewerState) &&
    (value.viewerState.following === null ||
      typeof value.viewerState.following === 'boolean')
  );
}

/**
 * Checks every field the query selects, not a sample: the return is cast to
 * `ThesisPublicationSummary`, so anything left unchecked is a field the public
 * type promises and a caller can still read as `undefined`.
 */
export function isThesisPublication(
  value: unknown
): value is ThesisPublicationSummary {
  if (!record(value)) return false;
  for (const field of [
    'thesisId',
    'playbookId',
    'authorVersionId',
    'materialVersionId',
  ] as const) {
    if (!isPositiveInt64(value[field])) return false;
  }
  if (
    typeof value.itemKey !== 'string' ||
    !value.itemKey.trim() ||
    typeof value.title !== 'string' ||
    typeof value.body !== 'string' ||
    typeof value.publishedAtMs !== 'number' ||
    !Number.isFinite(value.publishedAtMs) ||
    typeof value.changeKind !== 'string' ||
    !value.changeKind.trim() ||
    typeof value.visibility !== 'string' ||
    typeof value.note !== 'string' ||
    typeof value.closingNote !== 'string'
  ) {
    return false;
  }
  for (const field of ['closed', 'archived', 'researchPaused'] as const) {
    if (typeof value[field] !== 'boolean') return false;
  }
  if (
    !positiveInt64List(value.entityIds) ||
    !positiveInt64List(value.categoryIds) ||
    !stanceList(value.entityStances) ||
    !entityList(value.entities) ||
    !mediaList(value.medias) ||
    !publisher(value.publisher) ||
    !snapshot(value.snapshotRelease)
  ) {
    return false;
  }
  return (
    value.signalFeed === null ||
    (record(value.signalFeed) && isPositiveInt64(value.signalFeed.id))
  );
}
