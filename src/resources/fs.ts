import type { AlvaClient } from '../client.js';
import type {
  FsReadParams,
  FsWriteParams,
  FsRawWriteParams,
  FsWriteResponse,
  FsStat,
  FsReaddirParams,
  FsReaddirResponse,
  FsMkdirParams,
  FsRemoveParams,
  FsRenameParams,
  FsCopyParams,
  FsSymlinkParams,
  FsReadlinkParams,
  FsChmodParams,
  FsGrantParams,
  FsRevokeParams,
} from '../types.js';

// Fixed bit value from ALFS WriteFlag; Gateway accepts it as a uint32 bitmask.
const WRITE_FLAG_APPEND = 1 << 0;

function isValidUtf8(bytes: Uint8Array): boolean {
  let i = 0;
  while (i < bytes.length) {
    const byte = bytes[i];
    if (byte <= 0x7f) {
      i += 1;
      continue;
    }

    let needed = 0;
    let minCodePoint = 0;
    let codePoint = 0;
    if (byte >= 0xc2 && byte <= 0xdf) {
      needed = 1;
      minCodePoint = 0x80;
      codePoint = byte & 0x1f;
    } else if (byte >= 0xe0 && byte <= 0xef) {
      needed = 2;
      minCodePoint = 0x800;
      codePoint = byte & 0x0f;
    } else if (byte >= 0xf0 && byte <= 0xf4) {
      needed = 3;
      minCodePoint = 0x10000;
      codePoint = byte & 0x07;
    } else {
      return false;
    }

    if (i + needed >= bytes.length) return false;
    for (let j = 1; j <= needed; j += 1) {
      const next = bytes[i + j];
      if ((next & 0xc0) !== 0x80) return false;
      codePoint = (codePoint << 6) | (next & 0x3f);
    }
    if (
      codePoint < minCodePoint ||
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      return false;
    }
    i += needed + 1;
  }
  return true;
}

export class FsResource {
  constructor(private client: AlvaClient) {}

  /** Returns `ArrayBuffer` for binary files, or parsed JSON for time-series virtual paths. */
  async read(params: FsReadParams): Promise<ArrayBuffer | unknown> {
    const result = await this.client._request('GET', '/api/v1/fs/read', {
      query: { path: params.path, offset: params.offset, size: params.size },
    });
    if (!(result instanceof ArrayBuffer)) return result;
    if (!isValidUtf8(new Uint8Array(result))) {
      return result;
    }
    const text = new TextDecoder('utf-8').decode(result);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /** Write file using JSON body (Mode 2). For text content. */
  async write(params: FsWriteParams): Promise<FsWriteResponse> {
    this.client._requireAuth();
    return this.client._request('POST', '/api/v1/fs/write', {
      body: {
        path: params.path,
        data: params.data,
        mkdir_parents: params.mkdir_parents,
        ...(params.append ? { flags: WRITE_FLAG_APPEND } : {}),
      },
    }) as Promise<FsWriteResponse>;
  }

  /** Write file using raw body (Mode 1). Supports binary data. Path and options are query params. */
  async rawWrite(params: FsRawWriteParams): Promise<FsWriteResponse> {
    this.client._requireAuth();
    return this.client._request('POST', '/api/v1/fs/write', {
      query: {
        path: params.path,
        mkdir_parents: params.mkdir_parents,
        ...(params.append ? { flags: WRITE_FLAG_APPEND } : {}),
      },
      rawBody: params.body,
    }) as Promise<FsWriteResponse>;
  }

  async stat(params: { path: string }): Promise<FsStat> {
    this.client._requireAuth();
    return this.client._request('GET', '/api/v1/fs/stat', {
      query: { path: params.path },
    }) as Promise<FsStat>;
  }

  async readdir(params: FsReaddirParams): Promise<FsReaddirResponse> {
    this.client._requireAuth();
    return this.client._request('GET', '/api/v1/fs/readdir', {
      query: { path: params.path, recursive: params.recursive },
    }) as Promise<FsReaddirResponse>;
  }

  async mkdir(params: FsMkdirParams): Promise<void> {
    this.client._requireAuth();
    await this.client._request('POST', '/api/v1/fs/mkdir', {
      body: { path: params.path },
    });
  }

  async remove(params: FsRemoveParams): Promise<void> {
    this.client._requireAuth();
    await this.client._request('DELETE', '/api/v1/fs/remove', {
      query: { path: params.path, recursive: params.recursive },
    });
  }

  async rename(params: FsRenameParams): Promise<void> {
    this.client._requireAuth();
    await this.client._request('POST', '/api/v1/fs/rename', {
      body: { old_path: params.old_path, new_path: params.new_path },
    });
  }

  async copy(params: FsCopyParams): Promise<void> {
    this.client._requireAuth();
    await this.client._request('POST', '/api/v1/fs/copy', {
      body: { src_path: params.src_path, dst_path: params.dst_path },
    });
  }

  async symlink(params: FsSymlinkParams): Promise<void> {
    this.client._requireAuth();
    await this.client._request('POST', '/api/v1/fs/symlink', {
      body: {
        target_path: params.target_path,
        link_path: params.link_path,
      },
    });
  }

  async readlink(params: FsReadlinkParams): Promise<{ target: string }> {
    this.client._requireAuth();
    return this.client._request('GET', '/api/v1/fs/readlink', {
      query: { path: params.path },
    }) as Promise<{ target: string }>;
  }

  async chmod(params: FsChmodParams): Promise<void> {
    this.client._requireAuth();
    await this.client._request('POST', '/api/v1/fs/chmod', {
      body: { path: params.path, mode: params.mode },
    });
  }

  async grant(params: FsGrantParams): Promise<void> {
    this.client._requireAuth();
    await this.client._request('POST', '/api/v1/fs/grant', {
      body: {
        path: params.path,
        subject: params.subject,
        permission: params.permission,
      },
    });
  }

  async revoke(params: FsRevokeParams): Promise<void> {
    this.client._requireAuth();
    await this.client._request('POST', '/api/v1/fs/revoke', {
      body: {
        path: params.path,
        subject: params.subject,
        permission: params.permission,
      },
    });
  }
}
