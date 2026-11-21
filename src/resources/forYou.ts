import type { AlvaClient } from '../client.js';
import type { Schema, V2Query } from '../platformApi.js';

export type ForYouListQuery = V2Query<'/me/for-you-entries', 'get'>;
export type ForYouThesesQuery = V2Query<'/me/for-you', 'get'>;

/** The caller's For You on /api/v2. */
export class ForYouResource {
  constructor(private client: AlvaClient) {}

  /**
   * One newest-first page of feed entries (posts and Thesis Signals),
   * optionally of one feed (`automationId`). Reading advances no watermark.
   */
  async list(query: ForYouListQuery = {}): Promise<Schema<'FeedEntryList'>> {
    return this.client._v2Request('GET', '/me/for-you-entries', { query });
  }

  /**
   * One ranked page of Thesis recommendations, the stream the Feed App reads
   * (`ranking` THESIS_ONLY unless given). Each item carries the Update it
   * recommends (`version`) and the Thesis as it is now (`thesis`). The order
   * is slot-mixed: page until `nextPageToken` is null and filter on
   * `version.publishedAt` yourself, even after an empty page. Publications
   * the viewer already saw are withheld by an upstream cooldown, and reading
   * records no impression.
   */
  async theses(
    query: ForYouThesesQuery = {}
  ): Promise<Schema<'ForYouItemList'>> {
    return this.client._v2Request('GET', '/me/for-you', {
      query: { ...query, ranking: query.ranking ?? 'THESIS_ONLY' },
    });
  }
}
