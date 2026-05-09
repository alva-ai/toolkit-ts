import type { AlvaClient } from '../client.js';
import type {
  FeedReleaseRequest,
  FeedReleaseResponse,
  PlaybookDraftRequest,
  PlaybookDraftResponse,
  PlaybookReleaseRequest,
  PlaybookReleaseResponse,
} from '../types.js';

export class ReleaseResource {
  constructor(private client: AlvaClient) {}

  async feed(params: FeedReleaseRequest): Promise<FeedReleaseResponse> {
    this.client._requireAuth();
    return this.client._request('POST', '/api/v1/release/feed', {
      body: {
        name: params.name,
        version: params.version,
        cronjob_id: params.cronjob_id,
        view_json: params.view_json,
        description: params.description,
        changelog: params.changelog,
      },
    }) as Promise<FeedReleaseResponse>;
  }

  async playbookDraft(
    params: PlaybookDraftRequest
  ): Promise<PlaybookDraftResponse> {
    this.client._requireAuth();
    return this.client._request('POST', '/api/v1/draft/playbook', {
      body: {
        name: params.name,
        display_name: params.display_name,
        description: params.description,
        feeds: params.feeds,
        trading_symbols: params.trading_symbols,
      },
    }) as Promise<PlaybookDraftResponse>;
  }

  async playbook(
    params: PlaybookReleaseRequest
  ): Promise<PlaybookReleaseResponse> {
    this.client._requireAuth();
    return this.client._request('POST', '/api/v1/release/playbook', {
      body: {
        name: params.name,
        version: params.version,
        feeds: params.feeds,
        changelog: params.changelog,
        readme_url: params.readme_url,
      },
    }) as Promise<PlaybookReleaseResponse>;
  }
}
