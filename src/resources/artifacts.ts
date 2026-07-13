import type { AlvaClient } from '../client.js';

export interface SDKArtifactFile {
  path: string;
  data_base64: string;
}

export interface SDKArtifactSource {
  type?: string;
  repository?: string;
  ref?: string;
}

export interface PublishSDKArtifactParams {
  package: string;
  version: string;
  files: SDKArtifactFile[];
  entrypoints: Record<string, string>;
  source?: SDKArtifactSource;
  refs?: string[];
  verify_readback?: boolean;
}

export interface PublishSDKArtifactResponse {
  response: {
    target_path: string;
    manifest_path: string;
    bundle_hash: string;
    updated_refs: string[];
    existed: boolean;
  };
  readback?: {
    manifest: Record<string, unknown>;
    manifest_path: string;
    entrypoint_path: string;
    entrypoint_bytes: number;
  };
  verification?: {
    verified: boolean;
    error?: { code: string; message: string };
  };
}

export class ArtifactsResource {
  constructor(private client: AlvaClient) {}

  async publishSDK(
    params: PublishSDKArtifactParams
  ): Promise<PublishSDKArtifactResponse> {
    this.client._requireAuth();
    return this.client._request('POST', '/api/v1/artifacts/sdk/publish', {
      body: params,
    }) as Promise<PublishSDKArtifactResponse>;
  }
}
