import type { AlvaClient } from '../client.js';
import { v2Path, type Schema, type V2Query } from '../platformApi.js';

export interface FollowWriteOptions {
  /** Idempotency-Key of the follow; a new UUID when omitted. */
  idempotencyKey?: string;
}

/** Unfollows run at most this many DELETEs at a time. */
const UNFOLLOW_CONCURRENCY = 5;

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
   * reached Alva: each Update with its author. A sync list: page with
   * `nextPageToken` while it is set; the last page gives `nextSyncToken`
   * instead, which a later read sends as `syncToken` to get only what arrived
   * since. Without either, a read starts 24 hours back.
   */
  async theses(
    query: V2Query<'/me/followed-profiles/thesis-updates', 'get'> = {}
  ): Promise<Schema<'FollowedThesisUpdateSyncList'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'GET',
      '/me/followed-profiles/thesis-updates',
      { query }
    );
  }
}
