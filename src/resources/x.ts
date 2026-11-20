import type { AlvaClient } from '../client.js';
import type { Schema, V2Query } from '../platformApi.js';

/** Read-only access to the current user's connected X account. X tokens stay in Backend. */
export class XResource {
  constructor(private client: AlvaClient) {}

  /** Local credential state, not live verification with X. */
  async status(): Promise<Schema<'XConnection'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/x-connection');
  }

  /** One live page of the accounts the user follows on X. */
  async following(
    query: V2Query<'/me/x-following', 'get'> = {}
  ): Promise<Schema<'XAccountList'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/x-following', { query });
  }

  /** One live page of the user's own posts on X. */
  async posts(
    query: V2Query<'/me/x-posts', 'get'> = {}
  ): Promise<Schema<'XPostList'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/x-posts', { query });
  }
}
