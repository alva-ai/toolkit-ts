import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import {
  THESIS_PUBLICATION_FIELDS,
  isThesisPublication,
  type ThesisPublicationSummary,
} from './forYou.js';

export interface ThesisPageParams {
  first?: number;
  cursor?: string;
}

export interface ListThesesParams extends ThesisPageParams {
  /** Exact Person slug; use personName for name search. */
  person?: string;
  personName?: string;
  personId?: string;
  /** Exact PublicUser username, not display name. */
  user?: string;
  userId?: string;
  ticker?: string;
  entityId?: string;
  /** Author lists only; matches the profile default. */
  status?: 'ACTIVE' | 'ARCHIVED';
}

export type ThesisReadScope =
  | {
      __typename: 'Person';
      id: string;
      slug: string;
      displayName: string;
      bio: string;
    }
  | {
      __typename: 'PublicUser';
      id: string;
      username: string;
      displayName: string;
      bio: string;
    }
  | {
      __typename: 'Entity';
      id: string;
      ticker: string;
      name: string;
      kind: string;
      assetClass: string;
      venue: { id: string; name: string } | null;
    };

export interface ThesisPageInfo {
  startCursor: string;
  endCursor: string;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ThesisListPage {
  scope: ThesisReadScope;
  edges: {
    cursor: string;
    node: {
      /** Internal ID accepted by get/version/signals, never external thesisId. */
      playbookId: string;
      /** Null when the author list has no readable publication snapshot. */
      publication: ThesisPublicationSummary | null;
    };
  }[];
  pageInfo: ThesisPageInfo;
}

export interface RelatedThesesPage {
  source: { playbookId: string; versionScope: 'CURRENT' };
  state: 'GENERATING' | 'READY' | 'FAILED';
  ready: boolean;
  edges: {
    cursor: string;
    node: {
      itemKey: string;
      publication: ThesisPublicationSummary;
      score: number;
    };
  }[];
  pageInfo: ThesisPageInfo;
  scanLimited: boolean;
  listId: string;
  pageCursor: string;
  nextCursor: string | null;
}

const PAGE = 'pageInfo { startCursor endCursor hasNextPage hasPreviousPage }';
const PERSON = '__typename id slug displayName bio';
const USER = '__typename id username displayName bio';
const ENTITY = '__typename id ticker name kind assetClass venue { id name }';
const AUTHOR_THESES = `theses(input: $input) {
  edges { cursor node { id latestRelease { thesisPublication { ${THESIS_PUBLICATION_FIELDS} } } } }
  ${PAGE}
}`;
const PERSON_QUERY = `query ToolkitPersonTheses($slug: String!, $input: ProfileThesisConnectionInput) {
  scope: person(slug: $slug) { ${PERSON} ${AUTHOR_THESES} }
}`;
const USER_QUERY = `query ToolkitUserTheses($username: String!, $input: ProfileThesisConnectionInput) {
  scope: publicUser(username: $username) { ${USER} ${AUTHOR_THESES} }
}`;
const PROFILE_QUERY = `query ToolkitProfileTheses($profile: PublicProfileRefInput!, $input: ProfileThesisConnectionInput) {
  scope: publicProfile(input: $profile) {
    ... on Person { ${PERSON} ${AUTHOR_THESES} }
    ... on PublicUser { ${USER} ${AUTHOR_THESES} }
  }
}`;
const ENTITY_QUERY = `query ToolkitEntityTheses($entity: MarketEntityLookupInput!, $input: EntityThesisConnectionInput) {
  market { scope: entity(input: $entity) { ${ENTITY}
    theses(input: $input) { edges { cursor node { ${THESIS_PUBLICATION_FIELDS} } } ${PAGE} }
  } }
}`;
const PEOPLE_QUERY = `query ToolkitThesisPeople($query: String!) {
  people(input: { query: $query, first: 50 }) { edges { cursor node { ${PERSON} } } ${PAGE} }
}`;
const ENTITIES_QUERY = `query ToolkitThesisEntities($query: String!) {
  market { entities(input: { query: $query, first: 50, byPrefix: false }) {
    edges { cursor node { ${ENTITY} } } ${PAGE}
  } }
}`;
const RELATED_QUERY = `query ToolkitRelatedTheses($id: ID!, $input: RelatedThesisInput) {
  node(id: $id) { ... on Playbook { id relatedTheses(input: $input) {
    state ready scanLimited listId pageCursor nextCursor ${PAGE}
    edges { cursor node { itemKey score publication { ${THESIS_PUBLICATION_FIELDS} } } }
  } } }
}`;

const SELECTORS = [
  'person',
  'personName',
  'personId',
  'user',
  'userId',
  'ticker',
  'entityId',
] as const;

export function validateThesisPageParams(params: ThesisPageParams): void {
  if (!record(params)) throw argument('Thesis parameters must be an object');
  const first = params.first === undefined ? 10 : params.first;
  if (
    typeof first !== 'number' ||
    !Number.isInteger(first) ||
    first < 1 ||
    first > 50
  ) {
    throw argument('first must be an integer between 1 and 50');
  }
  if (params.cursor !== undefined && !nonempty(params.cursor)) {
    throw argument('cursor must be non-empty');
  }
}

export function validateListThesesParams(params: ListThesesParams): void {
  validateThesisPageParams(params);
  if (SELECTORS.filter((key) => params[key] !== undefined).length !== 1) {
    throw argument(
      'Choose exactly one of person, personName, personId, user, userId, ticker or entityId'
    );
  }
  for (const key of SELECTORS) {
    if (params[key] !== undefined && !nonempty(params[key]))
      throw argument(`${key} must be non-empty`);
  }
  for (const key of ['personId', 'userId', 'entityId'] as const) {
    if (params[key] !== undefined && !positiveId(params[key]))
      throw argument(`${key} must be a positive int64 string`);
  }
  if (
    params.status !== undefined &&
    !['ACTIVE', 'ARCHIVED'].includes(params.status)
  ) {
    throw argument('status must be ACTIVE or ARCHIVED');
  }
  if (
    params.status !== undefined &&
    (params.ticker !== undefined || params.entityId !== undefined)
  ) {
    throw argument('status applies only to author lists');
  }
}

export async function listTheses(
  client: AlvaClient,
  params: ListThesesParams
): Promise<ThesisListPage> {
  validateListThesesParams(params);
  client._requireAuth();
  let person = params.person;
  let entityId = params.entityId;
  if (params.personName !== undefined) {
    const data = await query(client, PEOPLE_QUERY, {
      query: params.personName,
    });
    const candidate = resolveCandidate(data.people, 'Person');
    if (candidate.__typename !== 'Person') throw invalid();
    person = candidate.slug;
  }
  if (params.ticker !== undefined) {
    const data = await query(client, ENTITIES_QUERY, { query: params.ticker });
    if (!record(data.market)) throw invalid();
    const candidate = resolveCandidate(data.market.entities, 'Entity');
    entityId = candidate.id;
  }
  const input = { first: params.first ?? 10, after: params.cursor };
  let data: Record<string, unknown>;
  if (entityId !== undefined) {
    const result = await query(client, ENTITY_QUERY, {
      entity: { id: entityId },
      input,
    });
    if (!record(result.market)) throw invalid();
    data = result.market;
  } else {
    const profileInput = { ...input, status: params.status ?? 'ACTIVE' };
    if (person !== undefined) {
      data = await query(client, PERSON_QUERY, {
        slug: person,
        input: profileInput,
      });
    } else if (params.user !== undefined) {
      data = await query(client, USER_QUERY, {
        username: params.user,
        input: profileInput,
      });
    } else {
      data = await query(client, PROFILE_QUERY, {
        profile: {
          kind: params.personId !== undefined ? 'PERSON' : 'USER',
          id: params.personId ?? params.userId,
        },
        input: profileInput,
      });
    }
  }
  if (data.scope === null) throw notFound();
  const scope = readScope(data.scope);
  const expectedKind =
    entityId !== undefined
      ? 'Entity'
      : person !== undefined || params.personId !== undefined
        ? 'Person'
        : 'PublicUser';
  const expectedId = entityId ?? params.personId ?? params.userId;
  if (
    scope.__typename !== expectedKind ||
    (expectedId !== undefined && scope.id !== expectedId) ||
    (person !== undefined &&
      scope.__typename === 'Person' &&
      scope.slug !== person.trim()) ||
    (params.user !== undefined &&
      scope.__typename === 'PublicUser' &&
      scope.username !== params.user.trim())
  )
    throw invalid();
  if (!record(data.scope)) throw invalid();
  const connection = readConnection(data.scope.theses, input.first);
  const edges = connection.edges.map((edge) => {
    if (scope.__typename === 'Entity') {
      if (
        !validPublication(edge.node) ||
        !edge.node.entityIds.includes(scope.id)
      )
        throw invalid();
      return {
        cursor: edge.cursor,
        node: { playbookId: edge.node.playbookId, publication: edge.node },
      };
    }
    if (!record(edge.node) || !positiveId(edge.node.id)) throw invalid();
    const release = edge.node.latestRelease;
    if (release !== null && !record(release)) throw invalid();
    const publication = release === null ? null : release.thesisPublication;
    if (
      publication !== null &&
      (!validPublication(publication) ||
        publication.playbookId !== edge.node.id)
    )
      throw invalid();
    return {
      cursor: edge.cursor,
      node: { playbookId: edge.node.id, publication },
    };
  });
  return { scope, edges, pageInfo: connection.pageInfo };
}

export async function relatedTheses(
  client: AlvaClient,
  id: string,
  params: ThesisPageParams = {}
): Promise<RelatedThesesPage> {
  validateThesisPageParams(params);
  if (!positiveId(id))
    throw argument('id must be an internal positive int64 Playbook ID');
  client._requireAuth();
  const data = await query(client, RELATED_QUERY, {
    id: `Playbook:${id}`,
    input: { first: params.first ?? 10, after: params.cursor },
  });
  if (data.node === null) throw notFound();
  if (
    !record(data.node) ||
    data.node.id !== id ||
    !record(data.node.relatedTheses)
  )
    throw invalid();
  const value = data.node.relatedTheses;
  const connection = readConnection(value, params.first ?? 10);
  if (
    !['GENERATING', 'READY', 'FAILED'].includes(value.state as string) ||
    typeof value.ready !== 'boolean' ||
    value.ready !== (value.state === 'READY') ||
    typeof value.scanLimited !== 'boolean' ||
    typeof value.listId !== 'string' ||
    typeof value.pageCursor !== 'string' ||
    (value.nextCursor !== null && !nonempty(value.nextCursor)) ||
    connection.pageInfo.hasNextPage !== (value.nextCursor !== null)
  )
    throw invalid();
  for (const edge of connection.edges) {
    if (
      !record(edge.node) ||
      !nonempty(edge.node.itemKey) ||
      typeof edge.node.score !== 'number' ||
      !Number.isFinite(edge.node.score) ||
      !validPublication(edge.node.publication)
    )
      throw invalid();
  }
  return {
    source: { playbookId: id, versionScope: 'CURRENT' },
    ...value,
  } as unknown as RelatedThesesPage;
}

function validPublication(value: unknown): value is ThesisPublicationSummary {
  return (
    isThesisPublication(value) &&
    value.authorVersionId === value.snapshotRelease.versionId &&
    value.materialVersionId === value.snapshotRelease.materialVersionId
  );
}

function resolveCandidate(
  value: unknown,
  kind: 'Person' | 'Entity'
): ThesisReadScope {
  const connection = readConnection(value, 50);
  const candidates = connection.edges.map((edge) => readScope(edge.node));
  if (candidates.some((candidate) => candidate.__typename !== kind))
    throw invalid();
  if (candidates.length === 0 && !connection.pageInfo.hasNextPage)
    throw notFound();
  if (candidates.length !== 1 || connection.pageInfo.hasNextPage) {
    throw new AlvaError(
      'AMBIGUOUS_IDENTITY',
      'Choose an exact identity before reading theses',
      400,
      {
        candidates,
        pageInfo: connection.pageInfo,
      }
    );
  }
  return candidates[0];
}

function readScope(value: unknown): ThesisReadScope {
  if (!record(value) || !nonempty(value.id)) throw invalid();
  if (value.__typename === 'Entity') {
    if (
      !['ticker', 'name', 'kind', 'assetClass'].every(
        (key) => typeof value[key] === 'string'
      ) ||
      (value.venue !== null &&
        (!record(value.venue) ||
          !nonempty(value.venue.id) ||
          typeof value.venue.name !== 'string'))
    )
      throw invalid();
    return {
      __typename: 'Entity',
      id: value.id,
      ticker: value.ticker,
      name: value.name,
      kind: value.kind,
      assetClass: value.assetClass,
      venue: value.venue,
    } as ThesisReadScope;
  }
  if (typeof value.displayName !== 'string' || typeof value.bio !== 'string')
    throw invalid();
  if (value.__typename === 'Person' && nonempty(value.slug)) {
    return {
      __typename: 'Person',
      id: value.id,
      slug: value.slug,
      displayName: value.displayName,
      bio: value.bio,
    };
  }
  if (value.__typename === 'PublicUser' && nonempty(value.username)) {
    return {
      __typename: 'PublicUser',
      id: value.id,
      username: value.username,
      displayName: value.displayName,
      bio: value.bio,
    };
  }
  throw invalid();
}

function readConnection(
  value: unknown,
  first: number
): {
  edges: { cursor: string; node: unknown }[];
  pageInfo: ThesisPageInfo;
} {
  if (
    !record(value) ||
    !Array.isArray(value.edges) ||
    value.edges.length > first ||
    !record(value.pageInfo)
  )
    throw invalid();
  const page = value.pageInfo;
  if (
    typeof page.startCursor !== 'string' ||
    typeof page.endCursor !== 'string' ||
    typeof page.hasNextPage !== 'boolean' ||
    typeof page.hasPreviousPage !== 'boolean'
  )
    throw invalid();
  const seen = new Set<string>();
  for (const edge of value.edges) {
    if (
      !record(edge) ||
      !nonempty(edge.cursor) ||
      seen.has(edge.cursor) ||
      !record(edge.node)
    )
      throw invalid();
    seen.add(edge.cursor);
  }
  // Empty pages and scan cursors are meaningful; do not infer exhaustion from edges.
  return value as unknown as {
    edges: { cursor: string; node: unknown }[];
    pageInfo: ThesisPageInfo;
  };
}

async function query(
  client: AlvaClient,
  document: string,
  variables: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await client._request('POST', '/query', {
    body: { query: document, variables },
  });
  if (!record(response)) throw invalid();
  if (response.errors !== undefined) {
    if (!Array.isArray(response.errors)) throw invalid();
    if (response.errors.length) {
      const messages = response.errors.flatMap((error) =>
        record(error) && typeof error.message === 'string'
          ? [error.message]
          : []
      );
      throw new AlvaError(
        'GRAPHQL_ERROR',
        messages.join('; ') || 'GraphQL request failed',
        400,
        { errors: response.errors }
      );
    }
  }
  if (!record(response.data)) throw invalid();
  return response.data;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function positiveId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[1-9]\d{0,18}$/.test(value) &&
    BigInt(value) <= 9223372036854775807n
  );
}
function argument(message: string): AlvaError {
  return new AlvaError('INVALID_ARGUMENT', message, 400);
}
function invalid(): AlvaError {
  return new AlvaError(
    'GRAPHQL_INVALID_RESPONSE',
    'Invalid Thesis read response',
    502
  );
}
function notFound(): AlvaError {
  return new AlvaError(
    'NOT_FOUND',
    'No visible matching identity or Thesis found',
    404
  );
}
