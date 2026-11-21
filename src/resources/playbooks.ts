import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import {
  collectAll,
  orNull,
  v2Path,
  type Schema,
  type V2Query,
} from '../platformApi.js';

/** The catalog query of `trending`: tags, search, order and page. */
export type PlaybookCatalogQuery = Omit<
  V2Query<'/playbooks', 'get'>,
  'ids' | 'owner'
>;

/** pageSize and pageToken of `listByOwner`. */
export type PlaybookPageQuery = Pick<
  V2Query<'/playbooks', 'get'>,
  'pageSize' | 'pageToken'
>;

export type OwnPlaybooksQuery = V2Query<'/me/playbooks', 'get'>;

export interface PlaybookWriteOptions {
  /** The write's Idempotency-Key; omitted, each call gets a new one. */
  idempotencyKey?: string;
}

/**
 * Playbooks on /api/v2. Every read needs an API key; keyless discovery is
 * `client.v1.playbooks`.
 */
export class PlaybooksResource {
  constructor(private client: AlvaClient) {}

  /**
   * Playbooks by ID, in the order asked (at most 100). IDs the caller cannot
   * read, and deleted ones, are left out. An empty list is read without a
   * request.
   */
  async getByIds(ids: string[]): Promise<Schema<'Playbook'>[]> {
    if (ids.length === 0) return [];
    return collectAll(
      this.client._v2Pages<Schema<'Playbook'>>('/playbooks', {
        query: { ids },
        pageSize: 100,
      })
    );
  }

  /**
   * One page of a user's released Playbooks that the caller can read,
   * newest first. Drafts are not listed: `listOwn` lists the caller's own.
   */
  async listByOwner(
    owner: string,
    query: PlaybookPageQuery = {}
  ): Promise<Schema<'PlaybookList'>> {
    return this.client._v2Request('GET', '/playbooks', {
      query: { ...query, owner },
    });
  }

  /** One page of the caller's own Playbooks, drafts included. */
  async listOwn(
    query: OwnPlaybooksQuery = {}
  ): Promise<Schema<'PlaybookList'>> {
    return this.client._v2Request('GET', '/me/playbooks', { query });
  }

  /**
   * One Playbook by ID, or by its "owner/slug" ref; null when there is none
   * (404). A Playbook the caller may not read (403) is thrown.
   */
  async get(params: {
    id?: string;
    ref?: string;
  }): Promise<Schema<'Playbook'> | null> {
    if (params.id) {
      return orNull(
        this.client._v2Request<Schema<'Playbook'>>(
          'GET',
          v2Path`/playbooks/${params.id}`
        )
      );
    }
    if (params.ref) {
      const { owner, slug } = parsePlaybookRef(params.ref);
      return orNull(this.getBySlug(owner, slug));
    }
    throw new AlvaError('INVALID_ARGUMENT', 'id or ref is required', 400);
  }

  /** One Playbook by its owner's username and its slug. */
  async getBySlug(owner: string, slug: string): Promise<Schema<'Playbook'>> {
    return this.client._v2Request(
      'GET',
      v2Path`/playbooks/by-slug/${owner}/${slug}`
    );
  }

  /** One page of the discoverable catalog: most followed or newest, by tags or search. */
  async trending(
    query: PlaybookCatalogQuery = {}
  ): Promise<Schema<'PlaybookList'>> {
    return this.client._v2Request('GET', '/playbooks', { query });
  }

  /**
   * Changes a Playbook (JSON Merge Patch): its visibility and the Playbooks
   * it was remixed from. `private` and `paid` are paid-tier capabilities
   * (PERMISSION_DENIED otherwise). Widening a Playbook with bundled feeds
   * needs `confirmBundledFeedExposure`; leaving PAID needs
   * `confirmEndPaidRenewals` (reason PAID_RENEWALS_END_CONFIRMATION_REQUIRED).
   */
  async update(
    id: string,
    patch: Schema<'PlaybookPatch'>,
    options: PlaybookWriteOptions = {}
  ): Promise<Schema<'Playbook'>> {
    return this.client._v2Request('PATCH', v2Path`/playbooks/${id}`, {
      body: patch,
      idempotencyKey: options.idempotencyKey,
    });
  }
}

/** Splits an "owner/slug" Playbook ref. */
export function parsePlaybookRef(ref: string): { owner: string; slug: string } {
  const slash = ref.indexOf('/');
  if (slash <= 0 || slash === ref.length - 1) {
    throw new AlvaError(
      'INVALID_ARGUMENT',
      `Invalid ref "${ref}". Expected "owner/name".`,
      400
    );
  }
  return { owner: ref.slice(0, slash), slug: ref.slice(slash + 1) };
}

/**
 * The user-facing web origin (where Playbooks are browsable) of an API base
 * URL: `api-llm.prd.alva.ai` → `https://alva.ai`, `api-llm.stg.alva.ai` →
 * `https://stg.alva.ai`, and `https://alva.ai` for other hosts (custom base
 * URLs, local-dev).
 */
export function webOriginFromApiBase(apiBaseUrl: string): string {
  try {
    const host = new URL(apiBaseUrl).hostname;
    const match = /^api-llm\.([a-z0-9-]+)\.alva\.ai$/i.exec(host);
    if (match) {
      const env = match[1].toLowerCase();
      return env === 'prd' ? 'https://alva.ai' : `https://${env}.alva.ai`;
    }
  } catch {
    // Malformed base URL — fall through to the default origin.
  }
  return 'https://alva.ai';
}

/** A Playbook's web URL, `<origin>/u/<owner>/playbooks/<slug>`; empty without an owner. */
export function playbookUrl(
  playbook: Schema<'Playbook'>,
  webOrigin: string
): string {
  const owner = playbook.owner?.handle;
  return owner && playbook.slug
    ? `${webOrigin}/u/${owner}/playbooks/${playbook.slug}`
    : '';
}
