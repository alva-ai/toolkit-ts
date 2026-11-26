import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { fakeV2, problem } from '../fakeV2.js';
import { v2 } from '../v2Schema.js';
import {
  PLAYBOOK,
  PROFILE,
  REQUEST_ID,
  aPage,
  aPlaybook,
} from '../contentV2.js';

// The Playbook side of the content domain on /api/v2: discovery, publishing,
// comments, remix, Skillhub, SDK docs and feeds. Keyless discovery is
// client.v1, on /api/v1 with the 0.x shapes.

let fake: ReturnType<typeof fakeV2> | undefined;
afterEach(() => {
  fake?.restore();
  fake = undefined;
  vi.unstubAllGlobals();
});

function client() {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

const OTHER = 'playbook_0b';

const SKILL = v2('SkillDetail', {
  id: 'skill_0a',
  name: 'ai-digest',
  displayName: 'AI Digest',
  description: 'Daily AI news',
  tags: ['research'],
  owner: { id: null, handle: 'alva', displayName: null, avatarUrl: null },
  header: null,
  iconUrl: null,
  promptTemplate: null,
  updatedAt: '2026-11-01T10:00:00Z',
  files: [{ path: 'README.md', sizeBytes: 12 }],
});

/** A fetch answering /api/v1 with `body`, recording the URLs. */
function v1Fetch(body: unknown) {
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
      })
  );
  vi.stubGlobal('fetch', fetcher);
  return () => fetcher.mock.calls.map((c) => String((c as unknown[])[0]));
}

describe('PlaybooksResource', () => {
  it('getByIds() reads every requested ID in order, and nothing for none', async () => {
    fake = fakeV2({
      'GET /playbooks': [
        () => aPage([aPlaybook()], 'p2'),
        () => aPage([aPlaybook({ id: OTHER })]),
      ],
    });

    expect(await client().playbooks.getByIds([])).toEqual([]);
    expect(fake.calls).toHaveLength(0);

    await expect(
      client().playbooks.getByIds([PLAYBOOK, OTHER])
    ).resolves.toEqual([aPlaybook(), aPlaybook({ id: OTHER })]);
    expect(fake.calls[0].query.getAll('ids')).toEqual([PLAYBOOK, OTHER]);
    expect(fake.calls[1].query.get('pageToken')).toBe('p2');
  });

  it('lists an owner, my own Playbooks and the catalog as pages', async () => {
    const page = aPage([aPlaybook()], 'next');
    fake = fakeV2({
      'GET /playbooks': [() => page, () => page],
      'GET /me/playbooks': () => page,
    });

    await expect(
      client().playbooks.listByOwner('alice', { pageSize: 10, pageToken: 'p1' })
    ).resolves.toEqual(page);
    await expect(
      client().playbooks.listOwn({ status: 'DRAFT' })
    ).resolves.toEqual(page);
    await expect(
      client().playbooks.trending({
        tags: ['macro', 'ai'],
        query: 'scanner',
        orderBy: 'NEWEST',
      })
    ).resolves.toEqual(page);
    expect(fake.calls.map((c) => `${c.path}?${c.query}`)).toEqual([
      '/playbooks?pageSize=10&pageToken=p1&owner=alice',
      '/me/playbooks?status=DRAFT',
      '/playbooks?tags=macro&tags=ai&query=scanner&orderBy=NEWEST',
    ]);
  });

  it('get() is null only when the Playbook does not exist', async () => {
    fake = fakeV2({
      [`GET /playbooks/${PLAYBOOK}`]: [
        () => aPlaybook(),
        () => problem(404, 'NOT_FOUND'),
        () => problem(403, 'PERMISSION_DENIED'),
      ],
      'GET /playbooks/by-slug/alice/scanner': () => aPlaybook(),
    });

    await expect(client().playbooks.get({ id: PLAYBOOK })).resolves.toEqual(
      aPlaybook()
    );
    await expect(client().playbooks.get({ id: PLAYBOOK })).resolves.toBeNull();
    await expect(
      client().playbooks.get({ id: PLAYBOOK })
    ).rejects.toMatchObject({ status: 403, code: 'PERMISSION_DENIED' });
    await expect(
      client().playbooks.get({ ref: 'alice/scanner' })
    ).resolves.toEqual(aPlaybook());
    await expect(
      client().playbooks.get({ ref: 'alice' })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(fake.calls).toHaveLength(4);
  });

  it('update() sends a merge patch with the caller’s key', async () => {
    fake = fakeV2({
      [`PATCH /playbooks/${PLAYBOOK}`]: () =>
        aPlaybook({ visibility: 'PRIVATE' }),
    });
    const patch = {
      visibility: 'PRIVATE' as const,
      confirmBundledFeedExposure: true,
    };

    await expect(
      client().playbooks.update(PLAYBOOK, patch, { idempotencyKey: REQUEST_ID })
    ).resolves.toEqual(aPlaybook({ visibility: 'PRIVATE' }));
    expect(fake.calls[0].body).toEqual(patch);
    expect(fake.calls[0].headers['Content-Type']).toBe(
      'application/merge-patch+json'
    );
    expect(fake.calls[0].headers['Idempotency-Key']).toBe(`"${REQUEST_ID}"`);
  });

  it('refuses a keyless client on /api/v2 without a request', async () => {
    fake = fakeV2({});
    const pbsv = new AlvaClient({
      apiKey: 'key',
      pbsvToken: 'pbsv',
      baseUrl: 'https://api.test',
    });
    await expect(pbsv.playbooks.trending()).rejects.toMatchObject({
      code: 'CREDENTIAL_REQUIRED',
    });
    expect(fake.calls).toHaveLength(0);
  });
});

describe('client.v1.playbooks (keyless discovery)', () => {
  it('reads the public /api/v1 catalog with the 0.x shapes', async () => {
    const urls = v1Fetch({
      playbooks: [
        {
          id: 7,
          name: 'scanner',
          display_name: 'Scanner',
          creator: { name: 'alice' },
          cursor: 'c1',
        },
      ],
      has_next: true,
      items: [],
    });
    const playbooks = new AlvaClient({ baseUrl: 'https://api.test' }).v1
      .playbooks;

    const trending = await playbooks.trending({ tags: ['a', 'b'] });
    expect(trending.playbooks[0]).toMatchObject({
      id: '7',
      ref: 'alice/scanner',
      url: 'https://alva.ai/u/alice/playbooks/scanner',
      cursor: 'c1',
    });
    await playbooks.getByIds([]);
    await playbooks.getByIds(['1', '2']);
    await playbooks.listByOwner({ owner: 'alice' });
    expect(await playbooks.get({ ref: 'alice/macro' })).toBeNull();
    expect(urls()).toEqual([
      'https://api.test/api/v1/playbooks/trending?tags=a%2Cb',
      'https://api.test/api/v1/playbooks?ids=1%2C2',
      'https://api.test/api/v1/playbooks?owner=alice',
      'https://api.test/api/v1/playbooks?owner=alice&limit=100',
    ]);
  });
});

describe('ReleaseResource', () => {
  it('publishes a feed, a draft and a Playbook release with their bodies', async () => {
    const version = v2('AutomationVersion', {
      automationId: 'automation_0b',
      cronjobId: 'cronjob_0a',
      major: 1,
      name: 'btc-ema',
      version: '1.0.0',
    });
    const draft = v2('Draft', {
      id: 'draft_0a',
      playbook: aPlaybook(),
      url: null,
    });
    const release = v2('Release', {
      id: 'release_0a',
      playbook: aPlaybook(),
      url: 'https://alva.ai/u/alice/playbooks/scanner',
      version: 'v1.0.0',
    });
    fake = fakeV2({
      'POST /me/automations': () => version,
      'POST /drafts': () => draft,
      [`POST /playbooks/${PLAYBOOK}/publish`]: () => release,
    });
    const feed = {
      name: 'btc-ema',
      version: '1.0.0',
      cronjobId: 'cronjob_0a',
      viewJson: '{"chart":{"type":"line"}}',
      skipFirstRun: true,
    };
    const newDraft = {
      slug: 'scanner',
      title: 'Scanner',
      automations: [{ automationId: 'automation_0b', major: 1 }],
      skillId: 'skill_0a',
    };
    const newRelease = {
      version: 'v1.0.0',
      automations: [{ automationId: 'automation_0b' }],
      changelog: 'Initial',
      readmePath: '/alva/home/alice/playbooks/scanner/README.md',
      confirmBundledFeedExposure: true,
    };

    await expect(client().release.feed(feed)).resolves.toEqual(version);
    await expect(client().release.playbookDraft(newDraft)).resolves.toEqual(
      draft
    );
    await expect(
      client().release.playbook(PLAYBOOK, newRelease, {
        idempotencyKey: REQUEST_ID,
      })
    ).resolves.toEqual(release);
    expect(fake.calls.map((c) => c.body)).toEqual([feed, newDraft, newRelease]);
    expect(fake.calls[2].headers['Idempotency-Key']).toBe(`"${REQUEST_ID}"`);
  });
});

describe('FeedResource', () => {
  it('lists, pauses, resumes, deletes and publishes on the automation routes', async () => {
    const list = aPage([
      v2('AutomationSummary', {
        id: 'automation_0a',
        name: 'btc-ema',
        status: 'PAUSED',
        schedule: { cron: '0 * * * *', timezone: 'UTC' },
        flow: null,
        lastRunAt: null,
        totalRuns: 3,
        usedByCount: 1,
      }),
    ]);
    const automation = v2('Automation', {
      id: 'automation_0a',
      name: 'btc-ema',
      description: null,
      status: 'ACTIVE',
      schedule: { cron: '0 * * * *', timezone: 'UTC' },
      stats: {
        totalRuns: 3,
        succeededRuns: 3,
        failedRuns: 0,
        lastRunAt: null,
        lastRunStatus: null,
      },
      sendsAlerts: true,
      agentType: null,
      cronjobId: 'cronjob_0a',
      flow: null,
      flowConfigPath: null,
    });
    fake = fakeV2({
      'GET /me/automations': () => list,
      'POST /automations/automation_0a/pause': () => automation,
      'POST /automations/automation_0a/resume': () => automation,
      'DELETE /automations/automation_0a': () => ({}),
      'POST /automations/automation_0a/publish': () =>
        v2('AutomationVisibility', {
          id: 'automation_0a',
          visibility: 'PUBLIC',
        }),
      'POST /automations/automation_0a/unpublish': () =>
        v2('AutomationVisibility', {
          id: 'automation_0a',
          visibility: 'PRIVATE',
        }),
    });
    const feed = client().feed;

    await expect(feed.list({ status: 'PAUSED' })).resolves.toEqual(list);
    await expect(feed.stop('automation_0a')).resolves.toEqual(automation);
    await feed.resume('automation_0a');
    await expect(feed.delete('automation_0a')).resolves.toEqual({});
    await expect(
      feed.setVisibility('automation_0a', 'PUBLIC')
    ).resolves.toEqual({ id: 'automation_0a', visibility: 'PUBLIC' });
    await feed.setVisibility('automation_0a', 'PRIVATE');
    expect(fake.calls.map((c) => `${c.method} ${c.path}?${c.query}`)).toEqual([
      'GET /me/automations?status=PAUSED',
      'POST /automations/automation_0a/pause?',
      'POST /automations/automation_0a/resume?',
      'DELETE /automations/automation_0a?',
      'POST /automations/automation_0a/publish?',
      'POST /automations/automation_0a/unpublish?',
    ]);
  });

  it('refuses a visibility that is not PUBLIC or PRIVATE without a request', async () => {
    fake = fakeV2({});
    await expect(
      client().feed.setVisibility('automation_0a', 'public' as never)
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(fake.calls).toHaveLength(0);
  });
});

describe('CommentsResource and RemixResource', () => {
  it('posts, pins and unpins comments, and replaces remix sources', async () => {
    const comment = v2('Comment', {
      id: 'comment_0a',
      playbookId: PLAYBOOK,
      parentId: null,
      body: 'Great',
      author: {
        id: PROFILE,
        handle: 'alice',
        displayName: null,
        avatarUrl: null,
      },
      agentName: null,
      pinnedAt: null,
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
    });
    fake = fakeV2({
      [`POST /playbooks/${PLAYBOOK}/comments`]: () => comment,
      'PATCH /comments/comment_0a': [() => comment, () => comment],
      [`PATCH /playbooks/${PLAYBOOK}`]: () => aPlaybook(),
    });

    await expect(
      client().comments.create(PLAYBOOK, {
        body: 'Great',
        parentId: 'comment_0b',
      })
    ).resolves.toEqual(comment);
    await client().comments.pin('comment_0a');
    await client().comments.unpin('comment_0a');
    await expect(client().remix.save(PLAYBOOK, [OTHER])).resolves.toEqual(
      aPlaybook()
    );
    expect(fake.calls.map((c) => [c.method, c.path, c.body])).toEqual([
      [
        'POST',
        `/playbooks/${PLAYBOOK}/comments`,
        { body: 'Great', parentId: 'comment_0b' },
      ],
      ['PATCH', '/comments/comment_0a', { pinned: true }],
      ['PATCH', '/comments/comment_0a', { pinned: false }],
      ['PATCH', `/playbooks/${PLAYBOOK}`, { remixSourceIds: [OTHER] }],
    ]);
  });
});

describe('PlaybookSkillsResource', () => {
  it('lists pages and addresses a skill by name, then its file by path', async () => {
    const skills = aPage(
      [
        v2('Skill', {
          id: 'skill_0a',
          name: 'ai-digest',
          displayName: 'AI Digest',
          description: '',
          tags: [],
          owner: {
            id: null,
            handle: 'alva',
            displayName: null,
            avatarUrl: null,
          },
          header: null,
          iconUrl: null,
          promptTemplate: null,
          updatedAt: null,
        }),
      ],
      'next'
    );
    const tags = aPage([
      v2('SkillTag', { id: 'skill_tag_0a', name: 'research' }),
    ]);
    const file = v2('SkillFile', {
      skillId: 'skill_0a',
      path: 'references/a b.md',
      content: '# A',
      updatedAt: null,
    });
    fake = fakeV2({
      'GET /skills': () => skills,
      'GET /skill-tags': () => tags,
      'GET /skills/by-name/alva/ai-digest': [() => SKILL, () => SKILL],
      'GET /skills/skill_0a/files/by-path': () => file,
    });
    const playbookSkills = client().playbookSkills;

    await expect(
      playbookSkills.list({ tag: 'research', owner: 'alva' })
    ).resolves.toEqual(skills);
    await expect(playbookSkills.tags()).resolves.toEqual(tags);
    await expect(playbookSkills.get('alva/ai-digest')).resolves.toEqual(SKILL);
    await expect(
      playbookSkills.file('alva/ai-digest', 'references/a b.md')
    ).resolves.toEqual(file);
    expect(fake.calls.at(-1)?.query.get('path')).toBe('references/a b.md');
    await expect(playbookSkills.get('alva')).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      status: 400,
    });
    expect(fake.calls).toHaveLength(5);
  });

  it('keyless reads use the /api/v1 catalog with its 0.x shapes', async () => {
    const summary = {
      username: 'alva',
      name: 'ai-digest',
      display_name: 'AI Digest',
      description: '',
      tags: [],
      creator_uid: 7,
      updated_at: '2026-11-01',
    };
    const urls = v1Fetch({
      success: true,
      data: [{ ...summary, header: 'x' }],
    });
    const skills = new AlvaClient({ baseUrl: 'https://api.test' }).v1
      .playbookSkills;

    expect(await skills.list({ tag: 'research' })).toEqual({
      skills: [summary],
    });
    expect(await skills.get('alva/ai-digest')).toEqual({
      ...summary,
      files: [],
    });
    expect(urls()).toEqual([
      'https://api.test/api/v1/skills?tag=research',
      'https://api.test/api/v1/skills/alva/ai-digest',
    ]);
  });
});

describe('SdkDocsResource', () => {
  it('reads a module by name, a page of partitions and one partition', async () => {
    const module = v2('SDKModule', { name: '@arrays/data/x:v1', doc: '# x' });
    const partitions = aPage([
      v2('SDKPartition', { id: 'sdk_partition_0a', name: 'feed_widgets' }),
    ]);
    const partition = v2('SDKPartitionDetail', {
      id: 'sdk_partition_0a',
      name: 'feed_widgets',
      summary: 'Widgets',
    });
    fake = fakeV2({
      'GET /sdk-modules/by-name': () => module,
      'GET /sdk-partitions': () => partitions,
      'GET /sdk-partitions/by-name/feed_widgets': () => partition,
    });

    await expect(client().sdk.doc('@arrays/data/x:v1')).resolves.toEqual(
      module
    );
    await expect(client().sdk.partitions({ pageSize: 100 })).resolves.toEqual(
      partitions
    );
    await expect(
      client().sdk.partitionSummary('feed_widgets')
    ).resolves.toEqual(partition);
    expect(fake.calls[0].query.get('name')).toBe('@arrays/data/x:v1');
  });
});
