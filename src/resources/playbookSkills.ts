import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';

type Envelope<T> = { success: boolean; data: T; request_id?: string };

export interface PlaybookSkillSummary {
  username: string;
  name: string;
  description: string;
  tags: string[];
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

/**
 * Splits "<user>/<name>". Throws AlvaError on malformed input.
 */
export function parsePlaybookSkillId(s: string): {
  username: string;
  name: string;
} {
  const parts = s.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new AlvaError(
      'INVALID_ARGUMENT',
      `playbook skill identifier must be "<user>/<name>", got "${s}"`,
      0
    );
  }
  return { username: parts[0], name: parts[1] };
}

export class PlaybookSkillsResource {
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
    return { skills: res.data ?? [] };
  }

  async tags(): Promise<{ tags: PlaybookSkillTagEntry[] }> {
    const res = (await this.client._request(
      'GET',
      '/api/v1/skills/tags'
    )) as Envelope<PlaybookSkillTagEntry[]>;
    return { tags: res.data ?? [] };
  }

  async get(id: string): Promise<PlaybookSkillMeta> {
    const { username, name } = parsePlaybookSkillId(id);
    const u = encodeURIComponent(username);
    const n = encodeURIComponent(name);
    const res = (await this.client._request(
      'GET',
      `/api/v1/skills/${u}/${n}`
    )) as Envelope<PlaybookSkillMeta[]>;
    const meta = res.data?.[0];
    if (!meta) {
      throw new AlvaError(
        'NOT_FOUND',
        `empty playbook skills get response for ${id}`,
        0
      );
    }
    return meta;
  }

  async file(id: string, path: string): Promise<PlaybookSkillFile> {
    const { username, name } = parsePlaybookSkillId(id);
    const u = encodeURIComponent(username);
    const n = encodeURIComponent(name);
    // path may contain '/'; encode each segment separately to preserve them
    const p = path.split('/').map(encodeURIComponent).join('/');
    const res = (await this.client._request(
      'GET',
      `/api/v1/skills/${u}/${n}/files/${p}`
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
