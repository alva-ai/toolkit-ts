import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { collectAll, v2Path } from '../platformApi.js';
import type { AlvaId } from '../types.js';
import { hasCredential } from './playbooks.js';

type Envelope<T> = { success: boolean; data: T; request_id?: string };

export interface PlaybookSkillSummary {
  username: string;
  name: string;
  display_name: string;
  description: string;
  tags: string[];
  /** The owner's Profile ID; null for platform skills. */
  creator_uid: AlvaId | null;
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

/** A skill as /api/v2 returns it. */
interface WireSkill {
  id: AlvaId;
  name: string;
  displayName: string;
  description: string;
  tags: string[];
  owner: { id: AlvaId | null; handle: string };
  updatedAt: string;
  files?: { path: string; sizeBytes: number }[];
}

function fromWire(skill: WireSkill): PlaybookSkillSummary {
  return {
    username: skill.owner.handle,
    name: skill.name,
    display_name: skill.displayName,
    description: skill.description,
    tags: skill.tags,
    creator_uid: skill.owner.id,
    updated_at: skill.updatedAt,
  };
}

/** The keyless catalog of /api/v1; its creator is a uid, 0 for platform skills. */
type V1SkillSummary = Omit<PlaybookSkillSummary, 'creator_uid'> & {
  creator_uid: number;
  files?: PlaybookSkillFileMeta[];
};

function fromV1(raw: V1SkillSummary): PlaybookSkillSummary {
  return {
    username: raw.username,
    name: raw.name,
    display_name: raw.display_name,
    description: raw.description,
    tags: raw.tags,
    creator_uid: raw.creator_uid ? String(raw.creator_uid) : null,
    updated_at: raw.updated_at,
  };
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

/**
 * Playbook skills (Skillhub). With a credential they are read from /api/v2;
 * without one, from the keyless /api/v1 catalog, whose IDs are 0.x IDs.
 */
export class PlaybookSkillsResource {
  constructor(private client: AlvaClient) {}

  async list(params?: {
    tag?: string;
    username?: string;
  }): Promise<{ skills: PlaybookSkillSummary[] }> {
    if (!hasCredential(this.client)) {
      const query: Record<string, string> = {};
      if (params?.tag) query.tag = params.tag;
      if (params?.username) query.username = params.username;
      const res = (await this.client._request('GET', '/api/v1/skills', {
        query,
      })) as Envelope<V1SkillSummary[]>;
      return { skills: (res.data ?? []).map(fromV1) };
    }
    const skills = await collectAll(
      this.client._v2Pages<WireSkill>('/skills', {
        query: {
          tag: params?.tag || undefined,
          owner: params?.username || undefined,
        },
        pageSize: 100,
      })
    );
    return { skills: skills.map(fromWire) };
  }

  async tags(): Promise<{ tags: PlaybookSkillTagEntry[] }> {
    if (!hasCredential(this.client)) {
      const res = (await this.client._request(
        'GET',
        '/api/v1/skills/tags'
      )) as Envelope<PlaybookSkillTagEntry[]>;
      return { tags: res.data ?? [] };
    }
    const tags = await collectAll(
      this.client._v2Pages<{ name: string }>('/skill-tags', { pageSize: 100 })
    );
    return { tags: tags.map((t) => ({ name: t.name })) };
  }

  async get(id: string): Promise<PlaybookSkillMeta> {
    const { username, name } = parsePlaybookSkillId(id);
    if (!hasCredential(this.client)) {
      const res = (await this.client._request(
        'GET',
        `/api/v1/skills/${encodeURIComponent(username)}/${encodeURIComponent(name)}`
      )) as Envelope<V1SkillSummary[]>;
      const meta = res.data?.[0];
      if (!meta) {
        throw new AlvaError(
          'NOT_FOUND',
          `empty playbook skills get response for ${id}`,
          0
        );
      }
      return { ...fromV1(meta), files: meta.files ?? [] };
    }
    const skill = await this.skill(username, name);
    return {
      ...fromWire(skill),
      files: (skill.files ?? []).map((f) => ({
        path: f.path,
        size_bytes: f.sizeBytes,
      })),
    };
  }

  async file(id: string, path: string): Promise<PlaybookSkillFile> {
    const { username, name } = parsePlaybookSkillId(id);
    if (!hasCredential(this.client)) {
      // path may contain '/'; encode each segment separately to preserve them
      const p = path.split('/').map(encodeURIComponent).join('/');
      const res = (await this.client._request(
        'GET',
        `/api/v1/skills/${encodeURIComponent(username)}/${encodeURIComponent(name)}/files/${p}`
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
    const skill = await this.skill(username, name);
    const file = await this.client._v2Request<{
      path: string;
      content: string;
      updatedAt: string;
    }>('GET', v2Path`/skills/${skill.id}/files/by-path`, { query: { path } });
    return {
      username,
      name,
      path: file.path,
      content: file.content,
      updated_at: file.updatedAt,
    };
  }

  private skill(username: string, name: string): Promise<WireSkill> {
    return this.client._v2Request<WireSkill>(
      'GET',
      v2Path`/skills/by-name/${username}/${name}`
    );
  }
}
