import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import {
  THESIS_PUBLICATION_FIELDS,
  isPositiveInt64,
  isThesisPublication,
  record,
  type ThesisPublicationSummary,
} from './thesisPublication.js';

export interface ThesisPageParams {
  /** 1-50; omitted reads 10. */
  first?: number;
  /** The previous page's `nextCursor`. */
  cursor?: string;
}

export interface ListThesesParams extends ThesisPageParams {
  /** Exact Person slug, e.g. a Person publisher's `slug`. */
  person?: string;
  /** Person name search; resolves only a unique match. */
  personName?: string;
  /** Exact PublicUser username, e.g. a publisher's `username`; not a display name. */
  user?: string;
  /** Catalog ticker or alias; resolves only a unique entity. */
  ticker?: string;
  entityId?: string;
  /** Author lists only; omitted means ACTIVE. */
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

/**
 * `nextCursor` is the only continuation: pass it as `cursor`, and stop when it
 * is null. A page can be empty while `nextCursor` is still set.
 */
export interface ThesisListPage {
  scope: ThesisReadScope;
  edges: {
    cursor: string;
    node: {
      /** Internal ID accepted by get/version/signals/related. */
      playbookId: string;
      /** Null when the author list has no readable publication snapshot. */
      publication: ThesisPublicationSummary | null;
    };
  }[];
  nextCursor: string | null;
}

/** Related publications of the source's current version. */
export interface RelatedThesesPage {
  /** GENERATING and FAILED carry no matches; READY with no edges means none. */
  state: 'GENERATING' | 'READY' | 'FAILED';
  edges: {
    cursor: string;
    node: {
      itemKey: string;
      /** Relatedness, not quality or support. */
      score: number;
      publication: ThesisPublicationSummary;
    };
  }[];
  nextCursor: string | null;
}

type Edge = { cursor: string; node: Record<string, unknown> };
type ListNode = ThesisListPage['edges'][number]['node'];
type ScopeOf<K extends ThesisReadScope['__typename']> = Extract<
  ThesisReadScope,
  { __typename: K }
>;

const PAGE = 'pageInfo { endCursor hasNextPage }';
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
const ENTITY_QUERY = `query ToolkitEntityTheses($id: ID!, $input: EntityThesisConnectionInput) {
  market { scope: entity(input: { id: $id }) { ${ENTITY}
    theses(input: $input) { edges { cursor node { ${THESIS_PUBLICATION_FIELDS} } } ${PAGE} }
  } }
}`;
const PEOPLE_QUERY = `query ToolkitThesisPeople($query: String!) {
  search: people(input: { query: $query, first: 50 }) {
    edges { node { ${PERSON} } } pageInfo { hasNextPage }
  }
}`;
/** `byPrefix: false` is an exact catalog alias match, not a fuzzy search. */
const ENTITIES_QUERY = `query ToolkitThesisEntities($query: String!) {
  market { search: entities(input: { query: $query, first: 50, byPrefix: false }) {
    edges { node { ${ENTITY} } } pageInfo { hasNextPage }
  } }
}`;
const RELATED_QUERY = `query ToolkitRelatedTheses($id: ID!, $input: RelatedThesisInput) {
  node(id: $id) { ... on Playbook { relatedTheses(input: $input) {
    state nextCursor
    edges { cursor node { itemKey score publication { ${THESIS_PUBLICATION_FIELDS} } } }
  } } }
}`;

const SELECTORS = [
  'person',
  'personName',
  'user',
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
  const chosen = SELECTORS.filter((key) => params[key] !== undefined);
  if (chosen.length !== 1) {
    throw argument(
      'Choose exactly one of person, personName, user, ticker or entityId'
    );
  }
  if (!nonempty(params[chosen[0]]))
    throw argument(`${chosen[0]} must be non-empty`);
  if (params.entityId !== undefined && !isPositiveInt64(params.entityId)) {
    throw argument('entityId must be a positive int64 string');
  }
  if (
    params.status !== undefined &&
    params.status !== 'ACTIVE' &&
    params.status !== 'ARCHIVED'
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

/** One visible page; no automatic pagination, per-entry reads or truncation. */
export async function listTheses(
  client: AlvaClient,
  params: ListThesesParams
): Promise<ThesisListPage> {
  validateListThesesParams(params);
  client._requireAuth();
  const input = { first: params.first ?? 10, after: params.cursor };
  const entityId =
    params.ticker === undefined
      ? params.entityId
      : (await resolveUnique(client, ENTITIES_QUERY, params.ticker, 'Entity'))
          .id;
  if (entityId !== undefined) {
    const data = await graphql(client, ENTITY_QUERY, { id: entityId, input });
    if (!record(data.market)) throw invalid();
    return thesisPage(data.market.scope, (node) =>
      isThesisPublication(node)
        ? { playbookId: node.playbookId, publication: node }
        : undefined
    );
  }
  const profileInput = { ...input, status: params.status };
  const slug =
    params.personName === undefined
      ? params.person
      : (await resolveUnique(client, PEOPLE_QUERY, params.personName, 'Person'))
          .slug;
  const data =
    slug === undefined
      ? await graphql(client, USER_QUERY, {
          username: params.user,
          input: profileInput,
        })
      : await graphql(client, PERSON_QUERY, { slug, input: profileInput });
  return thesisPage(data.scope, (node) => {
    if (!isPositiveInt64(node.id)) return undefined;
    const release = node.latestRelease;
    if (release === null) return { playbookId: node.id, publication: null };
    if (!record(release)) return undefined;
    const publication = release.thesisPublication;
    if (publication !== null && !isThesisPublication(publication))
      return undefined;
    return { playbookId: node.id, publication };
  });
}

/** One page of related current publications; never polls a GENERATING state. */
export async function relatedTheses(
  client: AlvaClient,
  id: string,
  params: ThesisPageParams = {}
): Promise<RelatedThesesPage> {
  validateThesisPageParams(params);
  if (!isPositiveInt64(id))
    throw argument('id must be an internal positive int64 Playbook ID');
  client._requireAuth();
  const data = await graphql(client, RELATED_QUERY, {
    id: `Playbook:${id}`,
    input: { first: params.first ?? 10, after: params.cursor },
  });
  if (data.node === null) throw notFound();
  if (!record(data.node)) throw invalid();
  const value = data.node.relatedTheses;
  if (
    !record(value) ||
    !['GENERATING', 'READY', 'FAILED'].includes(value.state as string) ||
    (value.nextCursor !== null && !nonempty(value.nextCursor))
  )
    throw invalid();
  for (const edge of edges(value)) {
    if (
      !nonempty(edge.node.itemKey) ||
      typeof edge.node.score !== 'number' ||
      !isThesisPublication(edge.node.publication)
    )
      throw invalid();
  }
  return {
    state: value.state as RelatedThesesPage['state'],
    edges: value.edges as RelatedThesesPage['edges'],
    nextCursor: value.nextCursor as string | null,
  };
}

function thesisPage(
  value: unknown,
  readNode: (node: Record<string, unknown>) => ListNode | undefined
): ThesisListPage {
  if (value === null) throw notFound();
  const scope = readScope(value);
  if (!record(value) || !record(value.theses)) throw invalid();
  const page = value.theses;
  const items = edges(page).map((edge) => {
    const node = readNode(edge.node);
    if (node === undefined) throw invalid();
    return { cursor: edge.cursor, node };
  });
  return { scope, edges: items, nextCursor: nextCursor(page) };
}

/** Name/alias search used only to choose one exact identity, never a fallback. */
async function resolveUnique<K extends 'Person' | 'Entity'>(
  client: AlvaClient,
  document: string,
  text: string,
  kind: K
): Promise<ScopeOf<K>> {
  const data = await graphql(client, document, { query: text });
  const search = record(data.market) ? data.market.search : data.search;
  if (
    !record(search) ||
    !Array.isArray(search.edges) ||
    !record(search.pageInfo)
  )
    throw invalid();
  const candidates = search.edges.map((edge) =>
    readScope(record(edge) ? edge.node : undefined)
  );
  if (!candidates.every((c): c is ScopeOf<K> => c.__typename === kind))
    throw invalid();
  const more = search.pageInfo.hasNextPage === true;
  if (candidates.length === 1 && !more) return candidates[0];
  if (candidates.length === 0 && !more) throw notFound();
  throw new AlvaError(
    'AMBIGUOUS_IDENTITY',
    // ALPI Dispatch currently forwards only Error.message, not details.
    // Keep candidate identities available through that existing boundary too.
    `Choose an exact identity before reading theses. Candidates: ${JSON.stringify(candidates)}${
      more ? ' More matches exist; refine the name or ticker.' : ''
    }`,
    400,
    { candidates, more }
  );
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
  } else if (
    typeof value.displayName !== 'string' ||
    typeof value.bio !== 'string' ||
    !(
      (value.__typename === 'Person' && nonempty(value.slug)) ||
      (value.__typename === 'PublicUser' && nonempty(value.username))
    )
  ) {
    throw invalid();
  }
  // Return only the selected identity fields, not the nested `theses` page.
  const scope = { ...value };
  delete scope.theses;
  return scope as ThesisReadScope;
}

function edges(value: Record<string, unknown>): Edge[] {
  if (
    !Array.isArray(value.edges) ||
    !value.edges.every(
      (edge) => record(edge) && nonempty(edge.cursor) && record(edge.node)
    )
  )
    throw invalid();
  return value.edges as Edge[];
}

function nextCursor(page: Record<string, unknown>): string | null {
  const info = page.pageInfo;
  if (
    !record(info) ||
    typeof info.hasNextPage !== 'boolean' ||
    (info.hasNextPage && !nonempty(info.endCursor))
  )
    throw invalid();
  return info.hasNextPage ? (info.endCursor as string) : null;
}

/**
 * Fails closed on any GraphQL error, even with partial data. A uniform
 * canonical Gateway code (NOT_FOUND, PERMISSION_DENIED, UNAUTHENTICATED) keeps
 * its identity; mixed or other codes stay GRAPHQL_ERROR.
 */
async function graphql(
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
      const codes = new Set(
        response.errors.map((error) =>
          record(error) && record(error.extensions)
            ? error.extensions.code
            : undefined
        )
      );
      const [code] = codes;
      const status =
        codes.size === 1 && typeof code === 'string'
          ? CANONICAL_STATUS.get(code)
          : undefined;
      throw new AlvaError(
        status === undefined ? 'GRAPHQL_ERROR' : String(code),
        messages.join('; ') || 'GraphQL request failed',
        status ?? 400,
        { errors: response.errors }
      );
    }
  }
  if (!record(response.data)) throw invalid();
  return response.data;
}

const CANONICAL_STATUS = new Map([
  ['NOT_FOUND', 404],
  ['PERMISSION_DENIED', 403],
  ['UNAUTHENTICATED', 401],
]);

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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
