import type { AlvaClient } from '../client.js';
import type {
  ModuleDoc,
  PartitionsResponse,
  PartitionSummaryResponse,
} from '../types.js';

export class SdkDocsResource {
  constructor(private client: AlvaClient) {}

  async doc(params: { name: string }): Promise<ModuleDoc> {
    this.client._requireAuth();
    return this.client._request('GET', '/api/v1/sdk/doc', {
      query: { name: params.name },
    }) as Promise<ModuleDoc>;
  }

  async partitions(): Promise<PartitionsResponse> {
    this.client._requireAuth();
    return this.client._request(
      'GET',
      '/api/v1/sdk/partitions'
    ) as Promise<PartitionsResponse>;
  }

  async partitionSummary(params: {
    partition: string;
  }): Promise<PartitionSummaryResponse> {
    this.client._requireAuth();
    const encoded = encodeURIComponent(params.partition);
    return this.client._request(
      'GET',
      `/api/v1/sdk/partitions/${encoded}/summary`
    ) as Promise<PartitionSummaryResponse>;
  }
}
