import type { AlvaClient } from '../client.js';
import type { Schema } from '../platformApi.js';

export class CompanyNewsResource {
  constructor(private client: AlvaClient) {}

  /** Creates a company news feed: its Automation (id) and producer Cronjob. */
  async create(
    config: Schema<'CompanyNewsFeedConfig'>
  ): Promise<Schema<'CompanyNewsFeed'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/company-news-feeds', {
      body: config,
    });
  }
}
