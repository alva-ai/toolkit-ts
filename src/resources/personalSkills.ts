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

interface WirePersonalSkill {
  id: string;
  slug: string;
  templateRef: string;
  displayName: string;
  description: string;
  enabled: boolean;
  currentRev: number;
  contentHash: string;
  updatedAt: string;
}

interface WirePersonalSkillList {
  items?: WirePersonalSkill[];
  nextPageToken?: string | null;
}

interface WirePersonalSkillDetail extends WirePersonalSkill {
  files?: Array<{ path: string; sizeBytes: number }>;
}

interface WirePersonalSkillFile {
  id: string;
  slug: string;
  templateRef: string;
  rev: number;
  path: string;
  content: string;
  updatedAt: string;
}

interface WireSavePersonalSkillResult {
  skill: WirePersonalSkill;
  created: boolean;
}

function publicIDFromTemplateRef(
  templateRef: string,
  fallback: string
): string {
  return templateRef.startsWith('personal:')
    ? templateRef.slice('personal:'.length)
    : fallback;
}

function toSummary(w: WirePersonalSkill): PersonalSkillSummary {
  return {
    public_id: publicIDFromTemplateRef(w.templateRef, w.id),
    slug: w.slug,
    template_ref: w.templateRef,
    display_name: w.displayName,
    description: w.description,
    enabled: w.enabled,
    current_rev: w.currentRev,
    content_hash: w.contentHash,
    updated_at: w.updatedAt,
  };
}

export class PersonalSkillsResource {
  constructor(private client: AlvaClient) {}

  async list(params?: {
    include_disabled?: boolean;
  }): Promise<PersonalSkillListResponse> {
    const query: Record<string, string> = {};
    if (params?.include_disabled) query.includeDisabled = 'true';
    const res = (await this.client._request(
      'GET',
      '/api/v2/me/personal-skills',
      { query }
    )) as WirePersonalSkillList | null | undefined;
    return {
      skills: (res?.items ?? []).map(toSummary),
    };
  }

  async get(ref: string): Promise<PersonalSkillDetail> {
    const encoded = encodeURIComponent(validateRef(ref));
    const res = (await this.client._request(
      'GET',
      `/api/v2/me/personal-skills/${encoded}`
    )) as WirePersonalSkillDetail;
    return {
      skill: toSummary(res),
      files: (res.files ?? []).map((f) => ({
        path: f.path,
        size_bytes: f.sizeBytes,
      })),
    };
  }

  async file(
    ref: string,
    filePath: string,
    opts?: { rev?: number }
  ): Promise<PersonalSkillFile> {
    const encodedRef = encodeURIComponent(validateRef(ref));
    const relPath = validateRelPath(filePath);
    const query: Record<string, string> = { path: relPath };
    if (opts?.rev !== undefined) query.rev = String(opts.rev);
    const res = (await this.client._request(
      'GET',
      `/api/v2/me/personal-skills/${encodedRef}/files/by-path`,
      { query }
    )) as WirePersonalSkillFile;
    return {
      public_id: publicIDFromTemplateRef(res.templateRef, res.id),
      slug: res.slug,
      rev: res.rev,
      path: res.path,
      content: res.content,
      updated_at: res.updatedAt,
    };
  }

  async save(
    params: SavePersonalSkillParams
  ): Promise<SavePersonalSkillResponse> {
    const body: Record<string, unknown> = {
      slug: params.slug,
      displayName: params.display_name,
      description: params.description,
      files: params.files,
    };
    if (params.public_id !== undefined) body.ref = params.public_id;
    if (params.expected_rev !== undefined) {
      body.expectedRev = params.expected_rev;
    }
    const res = (await this.client._request(
      'POST',
      '/api/v2/me/personal-skills',
      { body }
    )) as WireSavePersonalSkillResult;
    return {
      skill: toSummary(res.skill),
      created: res.created,
    };
  }

  async setEnabled(
    ref: string,
    enabled: boolean
  ): Promise<{ skill: PersonalSkillSummary }> {
    const encoded = encodeURIComponent(validateRef(ref));
    const res = (await this.client._request(
      'PATCH',
      `/api/v2/me/personal-skills/${encoded}`,
      { body: { enabled } }
    )) as WirePersonalSkill;
    return { skill: toSummary(res) };
  }

  async delete(ref: string): Promise<{ deleted: boolean }> {
    const encoded = encodeURIComponent(validateRef(ref));
    await this.client._request(
      'DELETE',
      `/api/v2/me/personal-skills/${encoded}`
    );
    return { deleted: true };
  }
}
