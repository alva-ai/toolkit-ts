import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { parsePlaybookSkillId } from '../resources/playbookSkills.js';

// Keyless Skillhub reads on /api/v1, with their 0.x types: every /api/v2
// read needs an API key.

type Envelope<T> = { success: boolean; data: T; request_id?: string };

export interface PlaybookSkillSummary {
  username: string;
  name: string;
  display_name: string;
  description: string;
  tags: string[];
  /** The owner's uid; 0 for platform skills. */
  creator_uid: number;
  updated_at: string;
}

export interface PlaybookSkillFileMeta {
  path: string;
  size_bytes: number;
}

export interface PlaybookSkillMeta extends PlaybookSkillSummary {
  files: PlaybookSkillFileMeta[];
}

export interface PlaybookSkillFile {
  username: string;
  name: string;
  path: string;
  content: string;
  updated_at: string;
}

export interface PlaybookSkillTagEntry {
  name: string;
}

/** The catalog row as /api/v1 sends it; the summary keeps the 0.x members. */
type PlaybookSkillMetaWire = PlaybookSkillSummary & {
  files?: PlaybookSkillFileMeta[];
};

function summary(raw: PlaybookSkillSummary): PlaybookSkillSummary {
  return {
    username: raw.username,
    name: raw.name,
    display_name: raw.display_name,
    description: raw.description,
    tags: raw.tags,
    creator_uid: raw.creator_uid,
    updated_at: raw.updated_at,
  };
}

/** `client.v1.playbookSkills`: Skillhub reads without credentials. */
export class V1PlaybookSkillsResource {
  constructor(private client: AlvaClient) {}

  async list(params?: {
    tag?: string;
    username?: string;
  }): Promise<{ skills: PlaybookSkillSummary[] }> {
    const query: Record<string, string> = {};
    if (params?.tag) query.tag = params.tag;
    if (params?.username) query.username = params.username;
    const res = (await this.client._request('GET', '/api/v1/skills', {
      query,
    })) as Envelope<PlaybookSkillSummary[]>;
    return { skills: (res.data ?? []).map(summary) };
  }

  async tags(): Promise<{ tags: PlaybookSkillTagEntry[] }> {
    const res = (await this.client._request(
      'GET',
      '/api/v1/skills/tags'
    )) as Envelope<PlaybookSkillTagEntry[]>;
    return { tags: res.data ?? [] };
  }

  async get(id: string): Promise<PlaybookSkillMeta> {
    const { owner, name } = parsePlaybookSkillId(id);
    const res = (await this.client._request(
      'GET',
      `/api/v1/skills/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
    )) as Envelope<PlaybookSkillMetaWire[]>;
    const meta = res.data?.[0];
    if (!meta) {
      throw new AlvaError(
        'NOT_FOUND',
        `empty playbook skills get response for ${id}`,
        0
      );
    }
    return { ...summary(meta), files: meta.files ?? [] };
  }

  async file(id: string, path: string): Promise<PlaybookSkillFile> {
    const { owner, name } = parsePlaybookSkillId(id);
    // path may contain '/'; encode each segment separately to keep them.
    const p = path.split('/').map(encodeURIComponent).join('/');
    const res = (await this.client._request(
      'GET',
      `/api/v1/skills/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/files/${p}`
    )) as Envelope<PlaybookSkillFile[]>;
    const out = res.data?.[0];
    if (!out) {
      throw new AlvaError(
        'NOT_FOUND',
        `empty playbook skills file response for ${id} path ${path}`,
        0
      );
    }
    return out;
  }
}
