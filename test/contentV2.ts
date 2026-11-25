import type { Schema } from '../src/platformApi.js';
import { v2 } from './v2Schema.js';

// /api/v2 fixtures of the content domain (Theses, For You, Playbooks,
// Skillhub), each checked against its schema in the contract.

export const THESIS = 'thesis_0abc';
export const VERSION = 'thesis_version_0abd';
export const MATERIAL = 'thesis_version_0abe';
export const ASSET = 'asset_0nvda';
export const ASSET_2 = 'asset_0amd';
export const PROFILE = 'profile_0a1ce';
export const PLAYBOOK = 'playbook_0abc';
export const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000';

export function aVersion(
  overrides: Partial<Schema<'ThesisVersion'>> = {}
): Schema<'ThesisVersion'> {
  return v2('ThesisVersion', {
    id: VERSION,
    number: 2,
    thesisId: THESIS,
    materialVersionId: MATERIAL,
    changeKind: 'MATERIAL',
    publishedAt: '2026-11-01T10:00:00Z',
    editedAt: null,
    title: 'Thesis',
    body: 'line one\r\nline two',
    summary: null,
    note: null,
    assets: [
      {
        assetId: ASSET,
        stance: 'BULLISH',
        weight: null,
        symbol: 'NVDA',
        name: 'NVIDIA Corporation',
        logoUrl: 'https://example.com/nvda.svg',
        kind: 'STOCK',
      },
    ],
    categoryIds: [],
    media: [],
    sources: [],
    locked: false,
    excerpt: null,
    ...overrides,
  });
}

export function anAuthor(
  overrides: Partial<Schema<'ThesisAuthor'>> = {}
): Schema<'ThesisAuthor'> {
  return v2('ThesisAuthor', {
    id: PROFILE,
    kind: 'USER',
    handle: 'alice',
    displayName: 'Alice',
    avatarUrl: 'https://example.com/alice.png',
    bio: 'Investor',
    followerCount: 3,
    viewerState: { following: null },
    ...overrides,
  });
}

export function aThesis(
  overrides: Partial<Schema<'Thesis'>> = {},
  version: Partial<Schema<'ThesisVersion'>> = {}
): Schema<'Thesis'> {
  return v2('Thesis', {
    id: THESIS,
    number: 42,
    playbookId: PLAYBOOK,
    author: anAuthor(),
    visibility: 'PUBLIC',
    archived: false,
    archiveNote: null,
    closed: false,
    closingNote: null,
    research: {
      state: 'PARTIAL',
      status: 'READY',
      paused: false,
      pendingWork: 2,
      readComplete: false,
      lastAttemptAt: null,
      lastCompletedAt: null,
    },
    signalAutomationId: null,
    currentVersion: aVersion(version),
    ...overrides,
  });
}

export function aProfile(
  overrides: Partial<Schema<'Profile'>> = {}
): Schema<'Profile'> {
  return v2('Profile', {
    id: PROFILE,
    kind: 'USER',
    handle: 'alice',
    displayName: 'Alice',
    avatarUrl: null,
    followerCount: 3,
    viewerState: { following: false },
    xHandle: null,
    ...overrides,
  });
}

export function aPlaybook(
  overrides: Partial<Schema<'Playbook'>> = {}
): Schema<'Playbook'> {
  return v2('Playbook', {
    id: PLAYBOOK,
    slug: 'scanner',
    title: 'Scanner',
    description: 'Finds setups',
    visibility: 'PUBLIC',
    tags: ['macro', 'ai'],
    path: '/alva/home/alice/playbooks/scanner',
    readmePath: '/alva/home/alice/playbooks/scanner/README.md',
    followerCount: 7,
    remixCount: 0,
    owner: {
      id: PROFILE,
      handle: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
    },
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-02T10:00:00Z',
    ...overrides,
  });
}

/** One page of a list: `{items, nextPageToken}`. */
export function aPage<T>(
  items: T[],
  nextPageToken: string | null = null
): { items: T[]; nextPageToken: string | null } {
  return { items, nextPageToken };
}
