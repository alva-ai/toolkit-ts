import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';

export interface PersonalSkillSummary {
  public_id: string;
  slug: string;
  template_ref: string;
  display_name: string;
  description: string;
  enabled: boolean;
  current_rev: number;
  content_hash: string;
  updated_at: string;
}

export interface PersonalSkillFileMeta {
  path: string;
  size_bytes: number;
}

export interface PersonalSkillDetail {
  skill: PersonalSkillSummary;
  files: PersonalSkillFileMeta[];
}

export interface PersonalSkillFile {
  public_id: string;
  slug: string;
  rev: number;
  path: string;
  content: string;
  updated_at: string;
}

export interface PersonalSkillListResponse {
  skills: PersonalSkillSummary[];
}

export interface SavePersonalSkillFileInput {
  path: string;
  content: string;
}

export interface SavePersonalSkillParams {
  public_id?: string;
  slug: string;
  display_name: string;
  description: string;
  files: SavePersonalSkillFileInput[];
  expected_rev?: number;
}

export interface SavePersonalSkillResponse {
  skill: PersonalSkillSummary;
  created: boolean;
}

function validateRef(ref: string): string {
  const trimmed = ref.trim();
  if (!trimmed) {
    throw new AlvaError(
      'INVALID_ARGUMENT',
      'personal skill ref is required (personal:<id>, <id>, or <slug>)',
      0
    );
  }
  return trimmed;
}

const MAX_FILE_PATH_BYTES = 255;
const MAX_PATH_SEGMENT_BYTES = 128;
const DISALLOWED_PATH_CHARS =
  /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069<>\\]/;

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function validateRelPath(p: string): string {
  const trimmed = p.trim();
  if (
    !trimmed ||
    utf8ByteLength(trimmed) > MAX_FILE_PATH_BYTES ||
    trimmed.startsWith('/') ||
    DISALLOWED_PATH_CHARS.test(trimmed) ||
    trimmed
      .split('/')
      .some(
        (seg) =>
          seg === '' ||
          seg === '.' ||
          seg === '..' ||
          utf8ByteLength(seg) > MAX_PATH_SEGMENT_BYTES
      )
  ) {
    throw new AlvaError(
      'INVALID_ARGUMENT',
      'invalid relative personal skill file path',
      0
    );
  }
  return trimmed;
}

export class PersonalSkillsResource {
  constructor(private client: AlvaClient) {}

  async list(params?: {
    include_disabled?: boolean;
  }): Promise<PersonalSkillListResponse> {
    const query: Record<string, string> = {};
    if (params?.include_disabled) query.include_disabled = 'true';
    const res = (await this.client._request('GET', '/api/v1/personal-skills', {
      query,
    })) as PersonalSkillListResponse | null | undefined;
    return {
      skills: res?.skills ?? [],
    };
  }

  async get(ref: string): Promise<PersonalSkillDetail> {
    const encoded = encodeURIComponent(validateRef(ref));
    return (await this.client._request(
      'GET',
      `/api/v1/personal-skills/${encoded}`
    )) as PersonalSkillDetail;
  }

  async file(
    ref: string,
    filePath: string,
    opts?: { rev?: number }
  ): Promise<PersonalSkillFile> {
    const encodedRef = encodeURIComponent(validateRef(ref));
    const encodedPath = validateRelPath(filePath)
      .split('/')
      .map(encodeURIComponent)
      .join('/');
    const query: Record<string, string> = {};
    if (opts?.rev !== undefined) query.rev = String(opts.rev);
    return (await this.client._request(
      'GET',
      `/api/v1/personal-skills/${encodedRef}/files/${encodedPath}`,
      { query }
    )) as PersonalSkillFile;
  }

  async save(
    params: SavePersonalSkillParams
  ): Promise<SavePersonalSkillResponse> {
    return (await this.client._request('POST', '/api/v1/personal-skills', {
      body: params,
    })) as SavePersonalSkillResponse;
  }

  async setEnabled(
    ref: string,
    enabled: boolean
  ): Promise<{ skill: PersonalSkillSummary }> {
    const encoded = encodeURIComponent(validateRef(ref));
    return (await this.client._request(
      'PATCH',
      `/api/v1/personal-skills/${encoded}/enabled`,
      { body: { enabled } }
    )) as { skill: PersonalSkillSummary };
  }

  async delete(ref: string): Promise<{ deleted: boolean }> {
    const encoded = encodeURIComponent(validateRef(ref));
    return (await this.client._request(
      'DELETE',
      `/api/v1/personal-skills/${encoded}`
    )) as { deleted: boolean };
  }
}
