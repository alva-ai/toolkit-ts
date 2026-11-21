import type { AlvaClient } from '../client.js';
import type { Schema, V2Query } from '../platformApi.js';

/** The answer of GET /api/v2/fs/read: the file's bytes, or one range of them. */
export interface FsReadResult {
  data: ArrayBuffer;
  /**
   * Content-Type of the bytes: from the file's extension or ALFS metadata,
   * `application/json` for a virtual (time-series) path, else
   * `application/octet-stream`.
   */
  contentType: string;
  /** Content-Range of a ranged read (`bytes 0-99/1234`); null for the whole file. */
  contentRange: string | null;
}

export interface FsReadOptions {
  /**
   * One byte range (RFC 9110): `bytes=0-99`, `bytes=100-` or `bytes=-100`.
   * A read without one is refused for a file over 32 MiB (FILE_TOO_LARGE);
   * a range past the end is 416 RANGE_NOT_SATISFIABLE.
   */
  range?: string;
  signal?: AbortSignal;
}

export interface FsWriteOptions {
  /** Content-Type stored with the file; application/octet-stream when omitted. */
  contentType?: string;
  /** Idempotency-Key of the write; a new UUID when omitted. */
  idempotencyKey?: string;
}

export interface FsChangeOptions {
  /** Idempotency-Key of the change; a new UUID when omitted. */
  idempotencyKey?: string;
}

/**
 * ALFS files on /api/v2/fs (API key). Reads and writes move raw bytes; the
 * other calls are JSON. A Playbook-scoped PBSV or viewer token, or a
 * public read without a credential, uses `client.v1.fs`.
 */
export class FsResource {
  constructor(private client: AlvaClient) {}

  async read(
    query: V2Query<'/fs/read', 'get'>,
    options: FsReadOptions = {}
  ): Promise<FsReadResult> {
    this.client._requireAuth();
    const response = await this.client._v2Fetch('GET', '/fs/read', {
      query,
      range: options.range,
      signal: options.signal,
    });
    return {
      data: await response.arrayBuffer(),
      contentType:
        response.headers.get('content-type') ?? 'application/octet-stream',
      contentRange: response.headers.get('content-range'),
    };
  }

  /**
   * Writes raw bytes (at most 10 MiB); a string is written as its UTF-8
   * bytes. `mode` APPEND appends to the file, REPLACE (the default)
   * replaces it.
   */
  async write(
    query: V2Query<'/fs/write', 'post'>,
    data: Blob | BufferSource | string,
    options: FsWriteOptions = {}
  ): Promise<Schema<'WriteResult'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/fs/write', {
      query,
      rawBody: data,
      contentType: options.contentType,
      idempotencyKey: options.idempotencyKey,
    });
  }

  async stat(query: V2Query<'/fs/stat', 'get'>): Promise<Schema<'FileInfo'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/fs/stat', { query });
  }

  async readdir(
    query: V2Query<'/fs/readdir', 'get'>
  ): Promise<Schema<'DirectoryListing'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/fs/readdir', { query });
  }

  async readlink(
    query: V2Query<'/fs/readlink', 'get'>
  ): Promise<Schema<'Symlink'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/fs/readlink', { query });
  }

  async mkdir(
    body: Schema<'PathRequest'>,
    options: FsChangeOptions = {}
  ): Promise<Schema<'Done'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/fs/mkdir', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }

  async remove(
    body: Schema<'RemoveRequest'>,
    options: FsChangeOptions = {}
  ): Promise<Schema<'Done'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/fs/remove', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }

  async rename(
    body: Schema<'RenameRequest'>,
    options: FsChangeOptions = {}
  ): Promise<Schema<'Done'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/fs/rename', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }

  async copy(
    body: Schema<'CopyRequest'>,
    options: FsChangeOptions = {}
  ): Promise<Schema<'Done'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/fs/copy', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }

  async symlink(
    body: Schema<'SymlinkRequest'>,
    options: FsChangeOptions = {}
  ): Promise<Schema<'Done'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/fs/symlink', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }

  async chmod(
    body: Schema<'ChmodRequest'>,
    options: FsChangeOptions = {}
  ): Promise<Schema<'Done'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/fs/chmod', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** Shares a path (`files:share`, which agent keys do not hold). */
  async grant(
    body: Schema<'GrantRequest'>,
    options: FsChangeOptions = {}
  ): Promise<Schema<'Done'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/fs/grant', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }

  async revoke(
    body: Schema<'GrantRequest'>,
    options: FsChangeOptions = {}
  ): Promise<Schema<'Done'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/fs/revoke', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }
}
