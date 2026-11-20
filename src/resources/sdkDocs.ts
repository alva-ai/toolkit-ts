import type { AlvaClient } from '../client.js';
import { v2Path, type Schema, type V2Query } from '../platformApi.js';

/** Docs of the SDK modules Playbook scripts import, on /api/v2. */
export class SdkDocsResource {
  constructor(private client: AlvaClient) {}

  /** One module's doc, by its import name (`@arrays/...`). */
  async doc(name: string): Promise<Schema<'SDKModule'>> {
    return this.client._v2Request('GET', '/sdk-modules/by-name', {
      query: { name },
    });
  }

  /** One page of the doc partitions. */
  async partitions(
    query: V2Query<'/sdk-partitions', 'get'> = {}
  ): Promise<Schema<'SDKPartitionList'>> {
    return this.client._v2Request('GET', '/sdk-partitions', { query });
  }

  /** One partition and its summary, by name. */
  async partitionSummary(name: string): Promise<Schema<'SDKPartitionDetail'>> {
    return this.client._v2Request(
      'GET',
      v2Path`/sdk-partitions/by-name/${name}`
    );
  }
}
