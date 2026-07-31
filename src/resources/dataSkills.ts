import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import {
  getSkillEndpointMetadata,
  listAllSkillEndpointMetadata,
  listSkillEndpointMetadata,
  type SkillEndpointMetadata,
  type SkillEndpointTier,
} from './skillTiers.js';

const ARRAYS_DATA_API_PREFIX = 'arrays-data-api-';

type Envelope<T> = { success: boolean; data: T; request_id?: string };
type SkillTierCounts = Partial<Record<SkillEndpointTier, number>>;
type SkillNameSuggestion =
  | { kind: 'skill'; name: string }
  | { kind: 'endpoint'; skill: string; file: string };

const ENDPOINT_ALIAS_SUGGESTIONS: {
  aliases: readonly string[];
  skill: string;
  file: string;
}[] = [
  {
    aliases: ['company-profile', 'company-profiles'],
    skill: 'arrays-data-api-equity-fundamentals',
    file: 'company-detail',
  },
];

export type { SkillEndpointMetadata, SkillEndpointTier };

export interface SkillMetadata {
  endpoint_count: number;
  endpoint_tier_counts: SkillTierCounts;
  pro_count: number;
}

export interface SkillSummary {
  name: string;
  description: string;
  metadata?: SkillMetadata;
  endpoint_tier_counts?: SkillTierCounts;
}

export interface SkillDoc {
  name: string;
  description: string;
  content: string;
  metadata?: SkillMetadata | SkillEndpointMetadata;
  endpoint_metadata?: SkillEndpointMetadata[];
  endpoint_tier_counts?: SkillTierCounts;
}

export class DataSkillsResource {
  private skillCatalog?: Set<string>;
  private skillCatalogPromise?: Promise<Set<string>>;

  constructor(private client: AlvaClient) {}

  async list(): Promise<{ skills: SkillSummary[] }> {
    return this.fetchList();
  }

  async summary(params: { name: string }): Promise<SkillDoc> {
    await this.requireKnownSkill(params.name);
    const encoded = encodeURIComponent(params.name);
    const res = (await this.client._request(
      'GET',
      `/api/v1/skills/${encoded}`,
      {
        baseUrl: this.client.arraysBaseUrl,
        noAuth: true,
      }
    )) as Envelope<SkillDoc[]>;
    const doc = res.data?.[0];
    if (!doc)
      throw new Error(`empty skills summary response for "${params.name}"`);
    const endpointMetadata = listSkillEndpointMetadata(params.name);
    return {
      ...doc,
      ...metadataSummaryForSkill(params.name),
      ...(endpointMetadata.length > 0
        ? { endpoint_metadata: endpointMetadata }
        : {}),
    };
  }

  async endpoint(params: { name: string; file: string }): Promise<SkillDoc> {
    await this.requireKnownSkill(params.name);
    const encoded = encodeURIComponent(params.name);
    const res = (await this.client._request(
      'GET',
      `/api/v1/skills/${encoded}`,
      {
        baseUrl: this.client.arraysBaseUrl,
        noAuth: true,
        query: { endpoint: params.file },
      }
    )) as Envelope<SkillDoc[]>;
    const doc = res.data?.[0];
    if (!doc) {
      throw new Error(
        `empty skills endpoint response for "${params.name}" file "${params.file}"`
      );
    }
    const metadata = getSkillEndpointMetadata(params.name, params.file);
    return {
      ...doc,
      ...(metadata ? { metadata } : {}),
    };
  }

  private async requireKnownSkill(name: string): Promise<void> {
    const skillNames = await this.tryLoadSkillCatalog();
    if (!skillNames) return;
    if (skillNames.has(name)) return;
    const refreshedSkillNames = await this.tryRefreshSkillCatalog();
    if (!refreshedSkillNames) return;
    if (refreshedSkillNames.has(name)) return;
    throw new AlvaError(
      'NOT_FOUND',
      formatSkillNotFoundMessage(name, refreshedSkillNames),
      404,
      { name }
    );
  }

  private async tryLoadSkillCatalog(): Promise<Set<string> | undefined> {
    try {
      return await this.loadSkillCatalog();
    } catch {
      return undefined;
    }
  }

  private async tryRefreshSkillCatalog(): Promise<Set<string> | undefined> {
    try {
      return await this.refreshSkillCatalog();
    } catch {
      this.skillCatalogPromise = undefined;
      return undefined;
    }
  }

  private async loadSkillCatalog(): Promise<Set<string>> {
    if (this.skillCatalog) return this.skillCatalog;
    if (!this.skillCatalogPromise) {
      const promise = this.fetchList()
        .then(({ skills }) => this.cacheSkillCatalog(skills))
        .catch((err: unknown) => {
          if (this.skillCatalogPromise === promise) {
            this.skillCatalogPromise = undefined;
          }
          throw err;
        });
      this.skillCatalogPromise = promise;
    }
    return this.skillCatalogPromise;
  }

  private async refreshSkillCatalog(): Promise<Set<string>> {
    const { skills } = await this.fetchList();
    return this.cacheSkillCatalog(skills);
  }

  private async fetchList(): Promise<{ skills: SkillSummary[] }> {
    const res = (await this.client._request('GET', '/api/v1/skills', {
      baseUrl: this.client.arraysBaseUrl,
      noAuth: true,
    })) as Envelope<SkillSummary[]>;
    const skills = (res.data ?? []).map((skill) => ({
      ...skill,
      ...metadataSummaryForSkill(skill.name),
    }));
    this.cacheSkillCatalog(skills);
    return { skills };
  }

  private cacheSkillCatalog(skills: SkillSummary[]): Set<string> {
    const catalog = new Set(skills.map((skill) => skill.name));
    this.skillCatalog = catalog;
    this.skillCatalogPromise = Promise.resolve(catalog);
    return catalog;
  }
}

function formatSkillNotFoundMessage(name: string, skillNames: Set<string>) {
  const suggestion = suggestSkillName(name, skillNames);
  if (!suggestion) return `skill "${name}" not found`;
  if (suggestion.kind === 'endpoint') {
    return `skill "${name}" not found; did you mean skill "${suggestion.skill}" endpoint "${suggestion.file}"?`;
  }
  return `skill "${name}" not found; did you mean "${suggestion.name}"?`;
}

function suggestSkillName(
  name: string,
  skillNames: Set<string>
): SkillNameSuggestion | undefined {
  const candidates = [...skillNames].sort();
  const prefixed = `${ARRAYS_DATA_API_PREFIX}${name}`;
  if (!name.startsWith(ARRAYS_DATA_API_PREFIX) && skillNames.has(prefixed)) {
    return { kind: 'skill', name: prefixed };
  }

  return (
    bestSuffixOrTokenOverlap(name, candidates, skillNames) ??
    bestEditDistance(name, candidates)
  );
}

function bestSuffixOrTokenOverlap(
  name: string,
  candidates: string[],
  skillNames: Set<string>
): SkillNameSuggestion | undefined {
  const aliasSuggestion = explicitEndpointAliasSuggestion(name, skillNames);
  if (aliasSuggestion) return aliasSuggestion;

  const normalizedName = stripArraysDataApiPrefix(name);
  const queryTokens = tokenSet(name);
  let best: { suggestion: SkillNameSuggestion; score: number } | undefined;
  for (const candidate of candidates) {
    const normalizedCandidate = stripArraysDataApiPrefix(candidate);
    const candidateTokens = tokenSet(normalizedCandidate);
    let score = 0;
    if (
      normalizedCandidate.endsWith(normalizedName) ||
      normalizedName.endsWith(normalizedCandidate)
    ) {
      score += 100;
    }
    const overlap = countIntersection(queryTokens, candidateTokens);
    if (overlap > 0) {
      score += overlap * 10;
      score += overlap / candidateTokens.size;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { suggestion: { kind: 'skill', name: candidate }, score };
    }
  }
  for (const endpoint of listAllSkillEndpointMetadata()) {
    if (!skillNames.has(endpoint.skill)) continue;
    const endpointTokens = tokenSet(endpoint.file);
    const overlap = countIntersection(queryTokens, endpointTokens);
    if (overlap === 0) continue;
    const score = overlap * 10 + overlap / endpointTokens.size;
    if (!best || score > best.score) {
      best = {
        suggestion: {
          kind: 'endpoint',
          skill: endpoint.skill,
          file: endpoint.file,
        },
        score,
      };
    }
  }
  return best?.suggestion;
}

function explicitEndpointAliasSuggestion(
  name: string,
  skillNames: Set<string>
): SkillNameSuggestion | undefined {
  const normalizedName = stripArraysDataApiPrefix(name).toLowerCase();
  const alias = ENDPOINT_ALIAS_SUGGESTIONS.find((item) =>
    item.aliases.includes(normalizedName)
  );
  if (!alias || !skillNames.has(alias.skill)) return undefined;
  return { kind: 'endpoint', skill: alias.skill, file: alias.file };
}

function bestEditDistance(
  name: string,
  candidates: string[]
): SkillNameSuggestion | undefined {
  const normalizedName = stripArraysDataApiPrefix(name);
  let best: { candidate: string; distance: number } | undefined;
  for (const candidate of candidates) {
    const normalizedCandidate = stripArraysDataApiPrefix(candidate);
    const distance = levenshteinDistance(normalizedName, normalizedCandidate);
    const maxLen = Math.max(normalizedName.length, normalizedCandidate.length);
    if (distance > Math.max(3, Math.floor(maxLen * 0.4))) continue;
    if (!best || distance < best.distance) {
      best = { candidate, distance };
    }
  }
  return best ? { kind: 'skill', name: best.candidate } : undefined;
}

function stripArraysDataApiPrefix(value: string): string {
  return value.startsWith(ARRAYS_DATA_API_PREFIX)
    ? value.slice(ARRAYS_DATA_API_PREFIX.length)
    : value;
}

function tokenSet(value: string): Set<string> {
  return new Set(
    stripArraysDataApiPrefix(value)
      .split(/[^a-z0-9]+/i)
      .map((token) => token.toLowerCase())
      .filter(Boolean)
  );
}

function countIntersection(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const item of left) {
    if (right.has(item)) count += 1;
  }
  return count;
}

function levenshteinDistance(left: string, right: string): number {
  const prev = Array.from({ length: right.length + 1 }, (_, index) => index);
  const curr = Array<number>(right.length + 1);
  for (let i = 1; i <= left.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[right.length];
}

function metadataSummaryForSkill(skill: string): {
  metadata?: SkillMetadata;
  endpoint_tier_counts?: SkillTierCounts;
} {
  const endpointMetadata = listSkillEndpointMetadata(skill);
  if (endpointMetadata.length === 0) {
    return {};
  }
  const counts: SkillTierCounts = {};
  let proCount = 0;
  for (const endpoint of endpointMetadata) {
    counts[endpoint.tier] = (counts[endpoint.tier] ?? 0) + 1;
    if (endpoint.pro_required) proCount += 1;
  }
  return {
    endpoint_tier_counts: counts,
    metadata: {
      endpoint_count: endpointMetadata.length,
      endpoint_tier_counts: counts,
      pro_count: proCount,
    },
  };
}
