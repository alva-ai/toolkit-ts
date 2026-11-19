import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { PLAYBOOK, problem, v2Fetch } from '../contentV2.js';

// The Playbook side of the content domain on /api/v2 (M20): discovery,
// publishing, comments, remix, Skillhub and SDK docs.

afterEach(() => vi.unstubAllGlobals());

function client() {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

function keyless() {
  return new AlvaClient({ baseUrl: 'https://api.test' });
}

// A browser Playbook's client: its PBSV token is sent instead of the key.
function pbsv() {
  return new AlvaClient({
    apiKey: 'key',
    pbsvToken: 'pbsv',
    baseUrl: 'https://api.test',
  });
}

function wirePlaybook(overrides: Record<string, unknown> = {}) {
  return {
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
      id: 'profile_0alice',
      handle: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
    },
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
    ...overrides,
  };
}

const ME = { id: 'account_0alice', username: 'alice' };

describe('PlaybooksResource', () => {
  it('trending() maps the catalog page to agent items with the page cursor on the last one', async () => {
    const { calls } = v2Fetch({
      'GET /playbooks': {
        items: [
          wirePlaybook({ id: 'playbook_01', readmePath: null }),
          wirePlaybook(),
        ],
        nextPageToken: 'tok2',
      },
    });

    const result = await client().playbooks.trending({
      keyword: 'scanner',
      tags: ['macro', 'ai'],
      sort: 'RECENT',
      limit: 5,
      cursor: 'tok1',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].query.getAll('tags')).toEqual(['macro', 'ai']);
    expect(Object.fromEntries(calls[0].query)).toMatchObject({
      orderBy: 'NEWEST',
      query: 'scanner',
      pageSize: '5',
      pageToken: 'tok1',
    });
    const scanner = {
      ref: 'alice/scanner',
      username: 'alice',
      name: 'scanner',
      display_name: 'Scanner',
      description: 'Finds setups',
      tags: ['macro', 'ai'],
      follow_count: 7,
      url_path: '/u/alice/playbooks/scanner',
      url: 'https://alva.ai/u/alice/playbooks/scanner',
    };
    expect(result).toEqual({
      playbooks: [
        { id: 'playbook_01', ...scanner, cursor: '' },
        {
          id: PLAYBOOK,
          ...scanner,
          readme: '/alva/home/alice/playbooks/scanner/README.md',
          cursor: 'tok2',
        },
      ],
      has_next: true,
    });
  });

  it('trending() maps FOLLOWS and current, and refuses BACKWARD before any request', async () => {
    const { calls } = v2Fetch({
      'GET /playbooks': { items: [], nextPageToken: null },
    });
    const playbooks = client().playbooks;

    expect(
      await playbooks.trending({ sort: 'FOLLOWS', current: 'tok' })
    ).toEqual({ playbooks: [], has_next: false });
    expect(calls[0].query.get('orderBy')).toBe('MOST_FOLLOWED');
    expect(calls[0].query.get('pageToken')).toBe('tok');
    await expect(playbooks.trending({ dir: 'BACKWARD' })).rejects.toMatchObject(
      { code: 'INVALID_ARGUMENT' }
    );
    expect(calls).toHaveLength(1);
  });

  it('getByIds() repeats ids and maps discovery items', async () => {
    const { calls } = v2Fetch({
      'GET /playbooks': {
        items: [wirePlaybook({ owner: null })],
        nextPageToken: null,
      },
    });

    const result = await client().playbooks.getByIds([PLAYBOOK, 'playbook_02']);

    expect(calls[0].query.getAll('ids')).toEqual([PLAYBOOK, 'playbook_02']);
    expect(calls[0].query.get('pageSize')).toBe('100');
    expect(result).toEqual({
      items: [
        {
          id: PLAYBOOK,
          owner_username: '',
          name: 'scanner',
          display_name: 'Scanner',
          visibility: 'public',
        },
      ],
    });
  });

  it('listByOwner() and listOwn() return the page token as next_cursor and on the last row', async () => {
    const { calls } = v2Fetch({
      'GET /playbooks': {
        items: [wirePlaybook()],
        nextPageToken: 'next',
      },
      'GET /me/playbooks': {
        items: [wirePlaybook({ visibility: 'PRIVATE' })],
        nextPageToken: null,
      },
    });
    const playbooks = client().playbooks;

    expect(await playbooks.listByOwner({ owner: 'alice', limit: 10 })).toEqual({
      items: [
        {
          id: PLAYBOOK,
          owner_username: 'alice',
          name: 'scanner',
          display_name: 'Scanner',
          visibility: 'public',
          ref: 'alice/scanner',
          cursor: 'next',
        },
      ],
      has_next: true,
      next_cursor: 'next',
    });
    expect(Object.fromEntries(calls[0].query)).toEqual({
      owner: 'alice',
      pageSize: '10',
    });

    expect(await playbooks.listOwn({ filter: 'draft', cursor: 'c1' })).toEqual({
      playbooks: [
        {
          id: PLAYBOOK,
          name: 'scanner',
          display_name: 'Scanner',
          visibility: 'private',
          created_at: '2026-11-01T10:00:00.000Z',
          updated_at: '2026-11-02T10:00:00.000Z',
          cursor: '',
        },
      ],
      has_next: false,
    });
    expect(Object.fromEntries(calls[1].query)).toEqual({
      status: 'DRAFT',
      pageToken: 'c1',
    });
  });

  it('get() reads by ID or by slug, and is null when the Playbook is not readable', async () => {
    const { calls } = v2Fetch({
      [`GET /playbooks/${PLAYBOOK}`]: wirePlaybook(),
      'GET /playbooks/by-slug/alice/scanner': wirePlaybook(),
      'GET /playbooks/by-slug/alice/hidden': problem(403, 'PERMISSION_DENIED'),
    });
    const playbooks = client().playbooks;

    expect((await playbooks.get({ id: PLAYBOOK }))?.ref).toBe('alice/scanner');
    expect((await playbooks.get({ ref: 'alice/scanner' }))?.id).toBe(PLAYBOOK);
    expect(await playbooks.get({ ref: 'alice/hidden' })).toBeNull();
    expect(await playbooks.get({ ref: 'alice/missing' })).toBeNull();
    expect(calls.map((c) => c.path)).toEqual([
      `/playbooks/${PLAYBOOK}`,
      '/playbooks/by-slug/alice/scanner',
      '/playbooks/by-slug/alice/hidden',
      '/playbooks/by-slug/alice/missing',
    ]);
  });

  it('get() keeps other failures', async () => {
    v2Fetch({ [`GET /playbooks/${PLAYBOOK}`]: problem(500, 'INTERNAL') });
    await expect(
      client().playbooks.get({ id: PLAYBOOK })
    ).rejects.toMatchObject({ code: 'INTERNAL', status: 500 });
  });

  it('setVisibility() patches the caller’s own Playbook, confirming bundled feed exposure as v1 did', async () => {
    const { calls } = v2Fetch({
      'GET /me': ME,
      'GET /playbooks/by-slug/alice/a%20b': wirePlaybook(),
      [`PATCH /playbooks/${PLAYBOOK}`]: wirePlaybook({ visibility: 'PRIVATE' }),
    });

    const result = await client().playbooks.setVisibility({
      name: 'a b',
      visibility: 'private',
    });

    expect(result).toEqual({
      playbook_path: '/alva/home/alice/playbooks/scanner',
    });
    expect(calls[2].headers['Content-Type']).toBe(
      'application/merge-patch+json'
    );
    expect(calls[2].body).toEqual({
      visibility: 'PRIVATE',
      confirmBundledFeedExposure: true,
    });
  });

  it('setVisibility() rejects an invalid visibility before any request', async () => {
    const { fetcher } = v2Fetch({});
    await expect(
      client().playbooks.setVisibility({
        name: 'scanner',
        // @ts-expect-error testing runtime guard against bad input
        visibility: 'secret',
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keyless discovery reads the public /api/v1 catalog', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ playbooks: [], items: [], has_next: false }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', fetcher);
    const playbooks = keyless().playbooks;

    await playbooks.trending({ tags: ['a', 'b'] });
    await playbooks.getByIds(['1', '2']);
    await playbooks.listByOwner({ owner: 'alice' });
    expect(await playbooks.get({ ref: 'alice/macro' })).toBeNull();

    expect(fetcher.mock.calls.map((c) => String(c[0]))).toEqual([
      'https://api.test/api/v1/playbooks/trending?tags=a%2Cb',
      'https://api.test/api/v1/playbooks?ids=1%2C2',
      'https://api.test/api/v1/playbooks?owner=alice',
      'https://api.test/api/v1/playbooks?owner=alice&limit=100',
    ]);

    await pbsv().playbooks.trending();
    expect(String(fetcher.mock.calls[4][0])).toBe(
      'https://api.test/api/v1/playbooks/trending'
    );
  });
});

describe('ReleaseResource', () => {
  it('feed() publishes the cronjob as an automation and builds the feed path from the caller', async () => {
    const { calls } = v2Fetch({
      'GET /me': ME,
      'POST /me/automations': {
        automationId: 'automation_0btc',
        name: 'btc-ema',
        major: 1,
        version: '1.0.0',
        cronjobId: 'cronjob_0abc',
      },
    });

    const result = await client().release.feed({
      name: 'btc-ema',
      version: '1.0.0',
      cronjob_id: 'cronjob_0abc',
      view_json: { chart: { type: 'line' } },
      agent_type: 'alpi',
      skip_auto_trigger: true,
    });

    expect(result).toEqual({
      feed_id: 'automation_0btc',
      name: 'btc-ema',
      feed_major: 1,
      feed_path: '/alva/home/alice/feeds/btc-ema',
    });
    expect(calls[1].body).toEqual({
      name: 'btc-ema',
      version: '1.0.0',
      cronjobId: 'cronjob_0abc',
      viewJson: '{"chart":{"type":"line"}}',
      agentType: 'alpi',
      skipFirstRun: true,
    });
  });

  it('reads the caller once per client, shared with the other resources', async () => {
    const { calls } = v2Fetch({
      'GET /me': ME,
      'POST /me/automations': {
        automationId: 'automation_0btc',
        name: 'btc-ema',
        major: 1,
      },
    });
    const c = client();
    const params = {
      name: 'btc-ema',
      version: '1.0.0',
      cronjob_id: 'cronjob_0abc',
    };

    await c.release.feed(params);
    await c.release.feed(params);
    expect(await c.user._username()).toBe('alice');

    expect(calls.filter((call) => call.path === '/me')).toHaveLength(1);
  });

  it('playbookDraft() resolves the source skill and pins automations', async () => {
    const { calls } = v2Fetch({
      'GET /skills/by-name/alva/screener': { id: 'skill_0screener' },
      'POST /drafts': {
        id: 'draft_0abc',
        playbook: wirePlaybook(),
        url: null,
      },
    });

    const result = await client().release.playbookDraft({
      name: 'scanner',
      display_name: 'Scanner',
      feeds: [
        { feed_id: 'automation_0a', feed_major: 2 },
        { feed_id: 'automation_0b' },
      ],
      trading_symbols: ['BTC'],
      skill_id: 'alva/screener',
      tags: ['btc'],
    });

    expect(result).toEqual({
      playbook_id: PLAYBOOK,
      playbook_version_id: 'draft_0abc',
      playbook_path: '/alva/home/alice/playbooks/scanner',
    });
    expect(calls[1].body).toEqual({
      slug: 'scanner',
      title: 'Scanner',
      automations: [
        { automationId: 'automation_0a', major: 2 },
        { automationId: 'automation_0b' },
      ],
      tradingSymbols: ['BTC'],
      skillId: 'skill_0screener',
      tags: ['btc'],
    });
  });

  it('playbookDraft() refuses a malformed skill reference before any request', async () => {
    const { fetcher } = v2Fetch({});
    await expect(
      client().release.playbookDraft({
        name: 'scanner',
        display_name: 'Scanner',
        feeds: [],
        skill_id: 'screener',
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([undefined, false, true])(
    'playbook() publishes the caller’s Playbook, exposure consent %s',
    async (confirmation) => {
      const { calls } = v2Fetch({
        'GET /me': ME,
        'GET /playbooks/by-slug/alice/scanner': wirePlaybook(),
        [`POST /playbooks/${PLAYBOOK}/publish`]: {
          id: 'release_0abc',
          playbook: wirePlaybook(),
          version: 'v1.0.0',
          url: 'https://alva.ai/u/alice/playbooks/scanner',
        },
      });

      const result = await client().release.playbook({
        confirm_bundled_feed_exposure: confirmation,
        name: 'scanner',
        version: 'v1.0.0',
        feeds: [{ feed_id: 'automation_0a' }],
        changelog: 'Initial release',
        readme_url: '/alva/home/alice/playbooks/scanner/README.md',
      });

      expect(result).toEqual({
        playbook_id: PLAYBOOK,
        version: 'v1.0.0',
        published_url: 'https://alva.ai/u/alice/playbooks/scanner',
        playbook_path: '/alva/home/alice/playbooks/scanner',
      });
      expect(calls[2].body).toEqual({
        version: 'v1.0.0',
        automations: [{ automationId: 'automation_0a' }],
        changelog: 'Initial release',
        readmePath: '/alva/home/alice/playbooks/scanner/README.md',
        ...(confirmation === undefined
          ? {}
          : { confirmBundledFeedExposure: confirmation }),
      });
    }
  );
});

describe('FeedResource', () => {
  const summary = {
    id: 'automation_0btc',
    name: 'btc-ema',
    status: 'ACTIVE',
    schedule: { cron: '0 * * * *', timezone: 'UTC' },
    totalRuns: 4,
    lastRunAt: null,
    usedByCount: 2,
    flow: null,
  };

  it('list() maps automations to feeds, active by default', async () => {
    const { calls } = v2Fetch({
      'GET /me/automations': {
        items: [
          summary,
          { ...summary, schedule: { cron: '', timezone: 'UTC' } },
        ],
        nextPageToken: 'next',
      },
    });

    const result = await client().feed.list();

    expect(Object.fromEntries(calls[0].query)).toEqual({ status: 'ACTIVE' });
    expect(result).toEqual({
      feeds: [
        {
          id: 'automation_0btc',
          name: 'btc-ema',
          status: 'ACTIVE',
          cron_expression: '0 * * * *',
          total_runs: 4,
          used_by_total: 2,
        },
        {
          id: 'automation_0btc',
          name: 'btc-ema',
          status: 'ACTIVE',
          total_runs: 4,
          used_by_total: 2,
        },
      ],
      next_cursor: 'next',
      has_more: true,
    });
  });

  it('list() sends no status for all, and the page parameters', async () => {
    const { calls } = v2Fetch({
      'GET /me/automations': { items: [], nextPageToken: null },
    });

    expect(
      await client().feed.list({ limit: 20, cursor: 'abc', status: 'all' })
    ).toEqual({ feeds: [], has_more: false });
    expect(Object.fromEntries(calls[0].query)).toEqual({
      pageSize: '20',
      pageToken: 'abc',
    });
  });

  it('lifecycle methods use the automation routes and keep their v1 output', async () => {
    const id = 'automation_0btc';
    const automation = { id, name: 'btc-ema', status: 'PAUSED' };
    const { calls } = v2Fetch({
      [`POST /automations/${id}/pause`]: automation,
      [`POST /automations/${id}/resume`]: { ...automation, status: 'ACTIVE' },
      [`DELETE /automations/${id}`]: {},
      [`POST /automations/${id}/publish`]: { id, visibility: 'PUBLIC' },
      [`POST /automations/${id}/unpublish`]: { id, visibility: 'PRIVATE' },
    });
    const feed = client().feed;

    expect(await feed.stop({ id })).toEqual({ id, status: 'PAUSED' });
    expect(await feed.resume({ id })).toEqual({ id, status: 'ACTIVE' });
    expect(await feed.delete({ id })).toEqual({ id });
    expect(await feed.setVisibility({ id, visibility: 'public' })).toEqual({
      id,
      visibility: 'public',
    });
    expect(await feed.setVisibility({ id, visibility: 'private' })).toEqual({
      id,
      visibility: 'private',
    });
    // Pause and resume require a UUID Idempotency-Key.
    expect(calls[0].headers['Idempotency-Key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('rejects an invalid id or visibility without a request', async () => {
    const { fetcher } = v2Fetch({});
    const feed = client().feed;
    for (const id of ['', ' ', 42 as unknown as string]) {
      await expect(feed.stop({ id })).rejects.toThrow(
        'feed id must be a non-empty ID'
      );
    }
    await expect(
      feed.setVisibility({
        id: 'automation_0btc',
        visibility: 'world' as unknown as 'public' | 'private',
      })
    ).rejects.toThrow("visibility must be 'public' or 'private'");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('CommentsResource', () => {
  const wireComment = {
    id: 'comment_0abc',
    playbookId: PLAYBOOK,
    parentId: null,
    body: 'Great!',
    author: {
      id: 'profile_0bob',
      handle: 'bob',
      displayName: 'Bob',
      avatarUrl: null,
    },
    agentName: 'Alva',
    pinnedAt: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:01.000Z',
  };
  const comment = {
    id: 'comment_0abc',
    playbook_id: PLAYBOOK,
    content: 'Great!',
    pin_at: null,
    created_at: Date.parse('2026-11-01T10:00:00.000Z'),
    updated_at: Date.parse('2026-11-01T10:00:01.000Z'),
    creator: { id: 'profile_0bob', name: 'bob', avatar: '' },
    agent: { name: 'Alva' },
  };

  it('create() finds the Playbook by slug and posts the comment', async () => {
    const { calls } = v2Fetch({
      'GET /playbooks/by-slug/alice/scanner': wirePlaybook(),
      [`POST /playbooks/${PLAYBOOK}/comments`]: wireComment,
    });

    expect(
      await client().comments.create({
        username: 'alice',
        name: 'scanner',
        content: 'Great!',
        parent_id: 'comment_0parent',
      })
    ).toEqual(comment);
    expect(calls[1].body).toEqual({
      body: 'Great!',
      parentId: 'comment_0parent',
    });
  });

  it('pin() and unpin() patch the comment', async () => {
    const pinnedAt = '2026-11-03T10:00:00.000Z';
    const { calls } = v2Fetch({
      'PATCH /comments/comment_0abc': (call) =>
        (call.body as { pinned: boolean }).pinned
          ? { ...wireComment, author: null, agentName: null, pinnedAt }
          : wireComment,
    });
    const comments = client().comments;

    expect(await comments.pin({ comment_id: 'comment_0abc' })).toEqual({
      id: 'comment_0abc',
      playbook_id: PLAYBOOK,
      content: 'Great!',
      pin_at: Date.parse(pinnedAt),
      created_at: comment.created_at,
      updated_at: comment.updated_at,
    });
    expect(await comments.unpin({ comment_id: 'comment_0abc' })).toEqual(
      comment
    );
    expect(calls.map((c) => c.body)).toEqual([
      { pinned: true },
      { pinned: false },
    ]);
  });
});

describe('RemixResource', () => {
  it('save() replaces the child’s remix sources with the parents’ IDs', async () => {
    const { calls } = v2Fetch({
      'GET /playbooks/by-slug/alice/child': wirePlaybook({
        id: 'playbook_0child',
      }),
      'GET /playbooks/by-slug/bob/p1': wirePlaybook({ id: 'playbook_0p1' }),
      'GET /playbooks/by-slug/carol/p2': wirePlaybook({ id: 'playbook_0p2' }),
      'PATCH /playbooks/playbook_0child': wirePlaybook({
        id: 'playbook_0child',
      }),
    });

    await expect(
      client().remix.save({
        child: { username: 'alice', name: 'child' },
        parents: [
          { username: 'bob', name: 'p1' },
          { username: 'carol', name: 'p2' },
        ],
      })
    ).resolves.toBeUndefined();

    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.body).toEqual({
      remixSourceIds: ['playbook_0p1', 'playbook_0p2'],
    });
  });
});

describe('PlaybookSkillsResource', () => {
  const skill = {
    id: 'skill_0digest',
    name: 'ai-digest',
    displayName: 'AI Digest',
    description: 'Summarize market news',
    tags: ['research'],
    header: 'Digest',
    promptTemplate: null,
    iconUrl: null,
    owner: { id: null, handle: 'alva', displayName: null, avatarUrl: null },
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
  const summary = {
    username: 'alva',
    name: 'ai-digest',
    display_name: 'AI Digest',
    description: 'Summarize market news',
    tags: ['research'],
    creator_uid: null,
    updated_at: '2026-06-01T00:00:00.000Z',
  };

  it('list() and tags() read every page', async () => {
    const { calls } = v2Fetch({
      'GET /skills': (call) =>
        call.query.get('pageToken')
          ? {
              items: [
                { ...skill, owner: { ...skill.owner, id: 'profile_0x' } },
              ],
              nextPageToken: null,
            }
          : { items: [skill], nextPageToken: 'p2' },
      'GET /skill-tags': {
        items: [{ id: 'skill_tag_0r', name: 'research' }],
        nextPageToken: null,
      },
    });
    const skills = client().playbookSkills;

    expect(await skills.list({ tag: 'research', username: 'alva' })).toEqual({
      skills: [summary, { ...summary, creator_uid: 'profile_0x' }],
    });
    expect(Object.fromEntries(calls[0].query)).toEqual({
      tag: 'research',
      owner: 'alva',
      pageSize: '100',
    });
    expect(calls[1].query.get('pageToken')).toBe('p2');
    expect(await skills.tags()).toEqual({ tags: [{ name: 'research' }] });
  });

  it('get() and file() address the skill by name, then its file by path', async () => {
    const { calls } = v2Fetch({
      'GET /skills/by-name/alva/ai-digest': {
        ...skill,
        files: [{ path: 'references/a.md', sizeBytes: 12 }],
      },
      'GET /skills/skill_0digest/files/by-path': {
        skillId: 'skill_0digest',
        path: 'references/a.md',
        content: '# A',
        updatedAt: '2026-06-02T00:00:00.000Z',
      },
    });
    const skills = client().playbookSkills;

    expect(await skills.get('alva/ai-digest')).toEqual({
      ...summary,
      files: [{ path: 'references/a.md', size_bytes: 12 }],
    });
    expect(await skills.file('alva/ai-digest', 'references/a.md')).toEqual({
      username: 'alva',
      name: 'ai-digest',
      path: 'references/a.md',
      content: '# A',
      updated_at: '2026-06-02T00:00:00.000Z',
    });
    expect(calls[2].query.get('path')).toBe('references/a.md');
  });

  it('keyless reads use the /api/v1 catalog and keep its uid as a string', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: [
              {
                ...summary,
                creator_uid: 7,
                disabled: false,
                suggest_prompt: 'x',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', fetcher);

    expect(await keyless().playbookSkills.list({ tag: 'research' })).toEqual({
      skills: [{ ...summary, creator_uid: '7' }],
    });
    expect(String(fetcher.mock.calls[0][0])).toBe(
      'https://api.test/api/v1/skills?tag=research'
    );
  });
});

describe('SdkDocsResource', () => {
  it('reads a module by name, every partition, and one partition summary', async () => {
    const { calls } = v2Fetch({
      'GET /sdk-modules/by-name': {
        name: '@arrays/crypto/ohlcv:v1.0.0',
        doc: '# OHLCV',
      },
      'GET /sdk-partitions': (call) =>
        call.query.get('pageToken')
          ? {
              items: [{ id: 'sdk_partition_0b', name: 'b' }],
              nextPageToken: null,
            }
          : {
              items: [{ id: 'sdk_partition_0a', name: 'a' }],
              nextPageToken: 'MQ',
            },
      'GET /sdk-partitions/by-name/spot%2Fprice': {
        id: 'sdk_partition_0s',
        name: 'spot/price',
        summary: 'Spot prices',
      },
    });
    const sdk = client().sdk;

    expect(await sdk.doc({ name: '@arrays/crypto/ohlcv:v1.0.0' })).toEqual({
      name: '@arrays/crypto/ohlcv:v1.0.0',
      doc: '# OHLCV',
    });
    expect(await sdk.partitions()).toEqual({ partitions: ['a', 'b'] });
    expect(await sdk.partitionSummary({ partition: 'spot/price' })).toEqual({
      summary: 'Spot prices',
    });
    expect(calls[0].query.get('name')).toBe('@arrays/crypto/ohlcv:v1.0.0');
    expect(calls[1].query.get('pageSize')).toBe('100');
  });
});
