import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { v2Path, type Schema, type V2Query } from '../platformApi.js';
import { parseThesisREST, type Thesis } from './thesisV1.js';

export interface FollowWriteOptions {
  /** Idempotency-Key of the follow; a new UUID when omitted. */
  idempotencyKey?: string;
}

export interface FollowingThesesParams {
  /** The previous page's `next_cursor`; omitted starts 24 hours back. */
  cursor?: string;
  /** 1-100; omitted reads 20. */
  first?: number;
}

/** The author of a Thesis in the following feed. */
export interface FollowingThesisAuthor {
  kind: 'user' | 'person';
  /** Set for a user. */
  username?: string;
  /** Set for a person. */
  slug?: string;
  display_name: string;
}

export interface FollowingThesisItem {
  /** The /api/v1 Thesis shape (thesisV1.ts): the feed has no /api/v2 route. */
  thesis: Thesis;
  /** Null when the author's profile could not be read. */
  author: FollowingThesisAuthor | null;
}

/**
 * Thesis Updates by the profiles the caller follows, oldest arrival first.
 * `next_cursor` is always set: pass it back as `cursor`, also after an empty
 * page, and page on while `has_more`.
 */
export interface FollowingThesesPage {
  items: FollowingThesisItem[];
  next_cursor: string;
  has_more: boolean;
}

/** Unfollows run at most this many DELETEs at a time. */
const UNFOLLOW_CONCURRENCY = 5;
const MAX_FOLLOWING_THESES_FIRST = 100;
const MAX_FOLLOWING_CURSOR_LENGTH = 2048;

/**
 * The Alva App's watchlist (Asset follows) and people follows (Alva users
 * and curated people). Playbook follows are `client.subscriptions`; Thesis
 * follows are Thesis star/unstar. The user always comes from the API key.
 */
export class FollowsResource {
  constructor(private client: AlvaClient) {}

  /** One page of the watchlist, most recently added first. */
  async watchlist(
    query: V2Query<'/me/followed-assets', 'get'> = {}
  ): Promise<Schema<'FollowedAssetList'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/followed-assets', { query });
  }

  /** The watchlist size. */
  async followCounts(): Promise<Schema<'FollowCounts'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/follow-counts');
  }

  /**
   * Adds 1-50 Assets to the watchlist in one atomic batch: an unknown Asset
   * is NOT_FOUND and nothing is written. `changed` is false for an Asset
   * already followed.
   */
  async followAssets(
    assetIds: string[],
    options: FollowWriteOptions = {}
  ): Promise<Schema<'FollowAssetsResponse'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/me/followed-assets', {
      body: { assetIds },
      idempotencyKey: options.idempotencyKey,
    });
  }

  /**
   * Removes one Asset from the watchlist. The removal is recorded even when
   * it was not followed, so holdings sync will not add it later.
   */
  async unfollowAsset(assetId: string): Promise<Schema<'AssetFollow'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'DELETE',
      v2Path`/me/followed-assets/${assetId}`
    );
  }

  /**
   * Removes Assets with one DELETE each; when one fails, the removals that
   * succeeded stand.
   */
  async unfollowAssets(
    assetIds: string[]
  ): Promise<Schema<'FollowAssetsResponse'>> {
    const assets: Schema<'AssetFollow'>[] = new Array(assetIds.length);
    let next = 0;
    const worker = async () => {
      while (next < assetIds.length) {
        const index = next++;
        assets[index] = await this.unfollowAsset(assetIds[index]);
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(UNFOLLOW_CONCURRENCY, assetIds.length) },
        worker
      )
    );
    return { assets };
  }

  /** Searches public profiles (Alva users and curated people). */
  async searchProfiles(
    query: V2Query<'/profiles', 'get'>
  ): Promise<Schema<'ProfileList'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/profiles', { query });
  }

  /** One page of the profiles the caller follows. */
  async profiles(
    query: V2Query<'/me/followed-profiles', 'get'> = {}
  ): Promise<Schema<'ProfileList'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/followed-profiles', { query });
  }

  /** Follows one profile. Idempotent. */
  async followProfile(
    profileId: string,
    options: FollowWriteOptions = {}
  ): Promise<Schema<'ProfileFollow'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/me/followed-profiles', {
      body: { profileId },
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** Unfollows one profile. Idempotent. */
  async unfollowProfile(profileId: string): Promise<Schema<'ProfileFollow'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'DELETE',
      v2Path`/me/followed-profiles/${profileId}`
    );
  }

  /**
   * Thesis Updates by the profiles the caller follows, in the order they
   * reached Alva. Keep `next_cursor` to read only what is new next time.
   * This is GET /api/v1/me/following/theses: its cursor is a lasting resume
   * point, which a sealed /api/v2 page token (24 hours) cannot be.
   */
  async theses(
    params: FollowingThesesParams = {}
  ): Promise<FollowingThesesPage> {
    const first = params.first;
    if (
      first !== undefined &&
      (!Number.isInteger(first) ||
        first < 1 ||
        first > MAX_FOLLOWING_THESES_FIRST)
    ) {
      throw new Error(
        `first must be an integer between 1 and ${MAX_FOLLOWING_THESES_FIRST}`
      );
    }
    const cursor = params.cursor;
    if (
      cursor !== undefined &&
      (typeof cursor !== 'string' ||
        !cursor.trim() ||
        cursor.length > MAX_FOLLOWING_CURSOR_LENGTH)
    ) {
      throw new Error(
        `cursor must be a non-empty cursor of at most ${MAX_FOLLOWING_CURSOR_LENGTH} characters`
      );
    }
    this.client._requireAuth();
    const query: Record<string, string> = {};
    if (first !== undefined) query.first = String(first);
    if (cursor !== undefined) query.cursor = cursor;
    return followingThesesPage(
      await this.client._request('GET', '/api/v1/me/following/theses', {
        query,
      })
    );
  }
}

function invalidFollowingTheses(message: string): AlvaError {
  return new AlvaError('INVALID_RESPONSE', message, 502);
}

function followingThesesPage(value: unknown): FollowingThesesPage {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    typeof value.next_cursor !== 'string' ||
    !value.next_cursor ||
    typeof value.has_more !== 'boolean'
  ) {
    throw invalidFollowingTheses('invalid following theses page');
  }
  return {
    items: value.items.map((item: unknown) => {
      if (!record(item)) {
        throw invalidFollowingTheses('invalid following theses item');
      }
      return {
        thesis: parseThesisREST(item.thesis),
        author: followingThesisAuthor(item.author),
      };
    }),
    next_cursor: value.next_cursor,
    has_more: value.has_more,
  };
}

function followingThesisAuthor(value: unknown): FollowingThesisAuthor | null {
  if (value === null) return null;
  if (
    !record(value) ||
    (value.kind !== 'user' && value.kind !== 'person') ||
    typeof value.display_name !== 'string' ||
    (value.username !== undefined && typeof value.username !== 'string') ||
    (value.slug !== undefined && typeof value.slug !== 'string')
  ) {
    throw invalidFollowingTheses('invalid following theses author');
  }
  return {
    kind: value.kind,
    ...(value.username === undefined ? {} : { username: value.username }),
    ...(value.slug === undefined ? {} : { slug: value.slug }),
    display_name: value.display_name,
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
