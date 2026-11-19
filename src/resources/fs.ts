import type { AlvaClient } from '../client.js';
import { isArrayBuffer } from '../arrayBuffer.js';
import { decodeBase64, encodeBase64 } from '../base64.js';
import type {
  FsReadParams,
  FsWriteParams,
  FsRawWriteParams,
  FsWriteResponse,
  FsMeta,
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

/** A FileInfo of /api/v2/fs/stat and /api/v2/fs/readdir. */
interface WireFileInfo {
  name: string;
  sizeBytes: number;
  mode: number;
  isDirectory: boolean;
  updatedAt: string | null;
  meta: FsMeta | null;
}

function fileStat(info: WireFileInfo): FsStat {
  return {
    name: info.name,
    size: info.sizeBytes,
    mode: info.mode,
    mod_time:
      info.updatedAt === null
        ? 0
        : Math.floor(Date.parse(info.updatedAt) / 1000),
    is_dir: info.isDirectory,
    meta: info.meta,
  };
}

/**
 * ALFS files. An API-key client calls /api/v2/fs. A client holding a
 * Playbook-scoped viewer or viewer token (the browser bundle, the Playbook
 * runtime) keeps /api/v1/fs: /api/v2 serves neither credential yet and sends
 * no CORS headers.
 */
export class FsResource {
  constructor(private client: AlvaClient) {}

  private get v1(): boolean {
    return !this.client._sendsApiKey();
  }

  /** Returns `ArrayBuffer` for binary files, or parsed JSON for time-series virtual paths. */
  async read(params: FsReadParams): Promise<ArrayBuffer | unknown> {
    if (this.v1) return this.readV1(params);
    const file = await this.client._v2Request<{
      content: string;
      encoding: 'UTF8' | 'BASE64';
    }>('GET', '/fs/read', {
      query: { path: params.path, offset: params.offset, size: params.size },
    });
    if (file.encoding === 'BASE64') return decodeBase64(file.content);
    try {
      return JSON.parse(file.content);
    } catch {
      return file.content;
    }
  }

  private async readV1(params: FsReadParams): Promise<ArrayBuffer | unknown> {
    const result = await this.client._request('GET', '/api/v1/fs/read', {
      query: { path: params.path, offset: params.offset, size: params.size },
    });
    // Jagent's Fetch implementation creates the response body in the runtime
    // realm. Such buffers have the ArrayBuffer internal slot but fail the
    // current realm's `instanceof ArrayBuffer` check.
    if (!isArrayBuffer(result)) return result;
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
    if (this.v1) {
      return this.client._request('POST', '/api/v1/fs/write', {
        body: {
          path: params.path,
          data: params.data,
          mkdir_parents: params.mkdir_parents,
          ...(params.append ? { flags: WRITE_FLAG_APPEND } : {}),
        },
      }) as Promise<FsWriteResponse>;
    }
    return this.writeV2(params.path, params.data, 'UTF8', params);
  }

  /** Write file using raw body (Mode 1). Supports binary data. Path and options are query params. */
  async rawWrite(params: FsRawWriteParams): Promise<FsWriteResponse> {
    this.client._requireAuth();
    if (this.v1) {
      return this.client._request('POST', '/api/v1/fs/write', {
        query: {
          path: params.path,
          mkdir_parents: params.mkdir_parents,
          ...(params.append ? { flags: WRITE_FLAG_APPEND } : {}),
        },
        rawBody: params.body,
      }) as Promise<FsWriteResponse>;
    }
    const bytes = new Uint8Array(await new Response(params.body).arrayBuffer());
    return this.writeV2(params.path, encodeBase64(bytes), 'BASE64', params);
  }

  private async writeV2(
    path: string,
    content: string,
    encoding: 'UTF8' | 'BASE64',
    options: { mkdir_parents?: boolean; append?: boolean }
  ): Promise<FsWriteResponse> {
    const written = await this.client._v2Request<{ bytesWritten: number }>(
      'POST',
      '/fs/write',
      {
        body: {
          path,
          content,
          encoding,
          mkdirParents: options.mkdir_parents ?? false,
          append: options.append ?? false,
        },
      }
    );
    return { bytes_written: written.bytesWritten };
  }

  async stat(params: { path: string }): Promise<FsStat> {
    this.client._requireAuth();
    if (this.v1) {
      return this.client._request('GET', '/api/v1/fs/stat', {
        query: { path: params.path },
      }) as Promise<FsStat>;
    }
    return fileStat(
      await this.client._v2Request<WireFileInfo>('GET', '/fs/stat', {
        query: { path: params.path },
      })
    );
  }

  async readdir(params: FsReaddirParams): Promise<FsReaddirResponse> {
    this.client._requireAuth();
    if (this.v1) {
      return this.client._request('GET', '/api/v1/fs/readdir', {
        query: { path: params.path, recursive: params.recursive },
      }) as Promise<FsReaddirResponse>;
    }
    const dir = await this.client._v2Request<{ entries: WireFileInfo[] }>(
      'GET',
      '/fs/readdir',
      { query: { path: params.path, recursive: params.recursive } }
    );
    return { entries: dir.entries.map(fileStat) };
  }

  async mkdir(params: FsMkdirParams): Promise<void> {
    await this.change('mkdir', { path: params.path });
  }

  async remove(params: FsRemoveParams): Promise<void> {
    this.client._requireAuth();
    if (this.v1) {
      await this.client._request('DELETE', '/api/v1/fs/remove', {
        query: { path: params.path, recursive: params.recursive },
      });
      return;
    }
    await this.client._v2Request('POST', '/fs/remove', {
      body: { path: params.path, recursive: params.recursive ?? false },
    });
  }

  async rename(params: FsRenameParams): Promise<void> {
    await this.change(
      'rename',
      { old_path: params.old_path, new_path: params.new_path },
      { oldPath: params.old_path, newPath: params.new_path }
    );
  }

  async copy(params: FsCopyParams): Promise<void> {
    await this.change(
      'copy',
      { src_path: params.src_path, dst_path: params.dst_path },
      { srcPath: params.src_path, dstPath: params.dst_path }
    );
  }

  async symlink(params: FsSymlinkParams): Promise<void> {
    await this.change(
      'symlink',
      { target_path: params.target_path, link_path: params.link_path },
      { targetPath: params.target_path, linkPath: params.link_path }
    );
  }

  async readlink(params: FsReadlinkParams): Promise<{ target_path: string }> {
    this.client._requireAuth();
    if (this.v1) {
      return this.client._request('GET', '/api/v1/fs/readlink', {
        query: { path: params.path },
      }) as Promise<{ target_path: string }>;
    }
    const link = await this.client._v2Request<{ targetPath: string }>(
      'GET',
      '/fs/readlink',
      { query: { path: params.path } }
    );
    return { target_path: link.targetPath };
  }

  async chmod(params: FsChmodParams): Promise<void> {
    await this.change('chmod', { path: params.path, mode: params.mode });
  }

  async grant(params: FsGrantParams): Promise<void> {
    await this.change('grant', {
      path: params.path,
      subject: params.subject,
      permission: params.permission,
    });
  }

  async revoke(params: FsRevokeParams): Promise<void> {
    await this.change('revoke', {
      path: params.path,
      subject: params.subject,
      permission: params.permission,
    });
  }

  /** POST {op} with a JSON body: v1's snake_case body, or v2's. */
  private async change(
    op: string,
    v1Body: Record<string, unknown>,
    v2Body = v1Body
  ): Promise<void> {
    this.client._requireAuth();
    if (this.v1) {
      await this.client._request('POST', `/api/v1/fs/${op}`, { body: v1Body });
      return;
    }
    await this.client._v2Request('POST', `/fs/${op}`, { body: v2Body });
  }
}
