import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { v2Path, type Schema, type V2Query } from '../platformApi.js';

export type PlaybookSkillsQuery = V2Query<'/skills', 'get'>;
export type PlaybookSkillTagsQuery = V2Query<'/skill-tags', 'get'>;

/** Splits a "<owner>/<name>" skill identifier. */
export function parsePlaybookSkillId(s: string): {
  owner: string;
  name: string;
} {
  const parts = s.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new AlvaError(
      'INVALID_ARGUMENT',
      `playbook skill identifier must be "<user>/<name>", got "${s}"`,
      400
    );
  }
  return { owner: parts[0], name: parts[1] };
}

/**
 * Playbook skills (Skillhub) on /api/v2. Every read needs an API key;
 * keyless reads are `client.v1.playbookSkills`.
 */
export class PlaybookSkillsResource {
  constructor(private client: AlvaClient) {}

  /** One page of skills, by tag or owner username. */
  async list(query: PlaybookSkillsQuery = {}): Promise<Schema<'SkillList'>> {
    return this.client._v2Request('GET', '/skills', { query });
  }

  /** One page of skill tags. */
  async tags(
    query: PlaybookSkillTagsQuery = {}
  ): Promise<Schema<'SkillTagList'>> {
    return this.client._v2Request('GET', '/skill-tags', { query });
  }

  /** A skill and its files, by "<owner>/<name>". */
  async get(id: string): Promise<Schema<'SkillDetail'>> {
    const { owner, name } = parsePlaybookSkillId(id);
    return this.client._v2Request(
      'GET',
      v2Path`/skills/by-name/${owner}/${name}`
    );
  }

  /** One file of a skill, by "<owner>/<name>" and its path. */
  async file(id: string, path: string): Promise<Schema<'SkillFile'>> {
    const skill = await this.get(id);
    return this.client._v2Request(
      'GET',
      v2Path`/skills/${skill.id}/files/by-path`,
      { query: { path } }
    );
  }
}
