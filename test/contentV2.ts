import { vi } from 'vitest';

// /api/v2 fixtures of the content domain (Theses, For You, Playbooks): wire
// objects as the gateway returns them, and a fetch that answers by route.

export const THESIS = 'thesis_0abc';
export const VERSION = 'thesis_version_0abd';
export const MATERIAL = 'thesis_version_0abe';
export const ASSET = 'asset_0nvda';
export const PROFILE = 'profile_0alice';
export const PLAYBOOK = 'playbook_0abc';
export const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000';

export function wireVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: VERSION,
    number: 2,
    thesisId: THESIS,
    materialVersionId: MATERIAL,
    changeKind: 'MATERIAL',
    publishedAt: '2026-11-01T10:00:00.000Z',
    editedAt: null,
    title: 'Thesis',
    body: 'line one\r\nline two',
    summary: null,
    note: null,
    assets: [
      {
        assetId: ASSET,
        stance: 'BULLISH',
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
  };
}

export function wireProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: PROFILE,
    kind: 'USER',
    handle: 'alice',
    displayName: 'Alice',
    avatarUrl: 'https://example.com/alice.png',
    bio: 'Investor',
    followerCount: 3,
    viewerState: { following: null },
    ...overrides,
  };
}

export function wireThesis(
  overrides: Record<string, unknown> = {},
  version: Record<string, unknown> = {}
) {
  return {
    id: THESIS,
    number: 42,
    playbookId: PLAYBOOK,
    author: wireProfile(),
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
    currentVersion: wireVersion(version),
    ...overrides,
  };
}

export interface V2Call {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
}

type Answer = unknown | Response;

/**
 * Stubs fetch with a router over `METHOD /path` (relative to /api/v2). A
 * route's answer is a JSON body, a Response, or a function of the call.
 */
export function v2Fetch(
  routes: Record<string, Answer | ((call: V2Call) => Answer)>
) {
  const calls: V2Call[] = [];
  const fetcher = vi.fn(async (input: string, init: RequestInit) => {
    const url = new URL(input);
    const call: V2Call = {
      method: init.method ?? 'GET',
      path: url.pathname.replace(/^\/api\/v2/, ''),
      query: url.searchParams,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: init.headers as Record<string, string>,
    };
    calls.push(call);
    const route = routes[`${call.method} ${call.path}`];
    if (route === undefined) {
      return problem(
        404,
        'NOT_FOUND',
        `no fixture for ${call.method} ${call.path}`
      );
    }
    const answer = typeof route === 'function' ? route(call) : route;
    if (answer instanceof Response) return answer;
    return new Response(JSON.stringify(answer), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetcher);
  return { fetcher, calls };
}

export function problem(
  status: number,
  code: string,
  detail = 'problem detail',
  extra: Record<string, unknown> = {}
): Response {
  const reason = typeof extra.reason === 'string' ? extra.reason : null;
  return new Response(
    JSON.stringify({
      type: `https://alva.ai/problems/${(reason ?? code).toLowerCase().replaceAll('_', '-')}`,
      title: code,
      status,
      detail,
      code,
      reason,
      requiredPermission: null,
      invalidParams: null,
      retryAfter: null,
      ...extra,
    }),
    { status, headers: { 'content-type': 'application/problem+json' } }
  );
}
