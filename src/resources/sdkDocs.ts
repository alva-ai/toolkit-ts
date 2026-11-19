import type { AlvaClient } from '../client.js';
import { collectAll, v2Path } from '../platformApi.js';
import type {
  ModuleDoc,
  PartitionsResponse,
  PartitionSummaryResponse,
} from '../types.js';

interface WirePartition {
  name: string;
}

export class SdkDocsResource {
  constructor(private client: AlvaClient) {}

  async doc(params: { name: string }): Promise<ModuleDoc> {
    this.client._requireAuth();
    const module = await this.client._v2Request<ModuleDoc>(
      'GET',
      '/sdk-modules/by-name',
      { query: { name: params.name } }
    );
    return { name: module.name, doc: module.doc };
  }

  async partitions(): Promise<PartitionsResponse> {
    this.client._requireAuth();
    const items = await collectAll(
      this.client._v2Pages<WirePartition>('/sdk-partitions', { pageSize: 100 })
    );
    return { partitions: items.map((p) => p.name) };
  }

  async partitionSummary(params: {
    partition: string;
  }): Promise<PartitionSummaryResponse> {
    this.client._requireAuth();
    const detail = await this.client._v2Request<{ summary: string }>(
      'GET',
      v2Path`/sdk-partitions/by-name/${params.partition}`
    );
    return { summary: detail.summary };
  }
}
