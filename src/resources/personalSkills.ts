import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';

export type PersonalSkillSourceType =
  | 'chat'
  | 'url'
  | 'upload'
  | 'agent_link'
  | 'skillhub_fork';

export interface PersonalSkillSummary {
  public_id: string;
  slug: string;
  template_ref: string;
  display_name: string;
  description: string;
  enabled: boolean;
  current_rev: number;
  content_hash: string;
  source_type: PersonalSkillSourceType;
  source_ref?: string;
  source_content_hash?: string;
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
  content_base64?: string;
  is_binary?: boolean;
  updated_at: string;
}

export interface PersonalSkillListResponse {
  skills: PersonalSkillSummary[];
  has_next_page: boolean;
  end_cursor: string;
}

export interface SavePersonalSkillFileInput {
  path: string;
  content?: string;
  content_base64?: string;
}

export interface SavePersonalSkillParams {
  public_id?: string;
  slug: string;
  display_name: string;
  description: string;
  files: SavePersonalSkillFileInput[];
  source_type: PersonalSkillSourceType;
  source_ref?: string;
  source_content_hash?: string;
  expected_rev?: number;
  expected_source_hash?: string;
  request_id?: string;
  overwrite_conflict?: boolean;
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

function validateRelPath(p: string): string {
  const trimmed = p.trim();
  if (
    !trimmed ||
    trimmed.startsWith('/') ||
    trimmed.includes('\\') ||
    trimmed.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')
  ) {
    throw new AlvaError(
      'INVALID_ARGUMENT',
      `invalid relative personal skill file path: "${p}"`,
      0
    );
  }
  return trimmed;
}

export class PersonalSkillsResource {
  constructor(private client: AlvaClient) {}

  async list(params?: {
    first?: number;
    after?: string;
    include_disabled?: boolean;
  }): Promise<PersonalSkillListResponse> {
    const query: Record<string, string> = {};
    if (params?.first !== undefined) query.first = String(params.first);
    if (params?.after) query.after = params.after;
    if (params?.include_disabled) query.include_disabled = 'true';
    const res = (await this.client._request('GET', '/api/v1/personal-skills', {
      query,
    })) as PersonalSkillListResponse;
    return {
      skills: res.skills ?? [],
      has_next_page: Boolean(res.has_next_page),
      end_cursor: res.end_cursor ?? '',
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

  async save(params: SavePersonalSkillParams): Promise<SavePersonalSkillResponse> {
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

  async reindex(ref: string): Promise<{ skill: PersonalSkillSummary }> {
    const encoded = encodeURIComponent(validateRef(ref));
    return (await this.client._request(
      'POST',
      `/api/v1/personal-skills/${encoded}/reindex`
    )) as { skill: PersonalSkillSummary };
  }
}
