import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AlvaClient } from '../src/client.js';
import { dispatchCli } from '../src/cli/dispatch.js';
import { ALPI_ALVA_COMMAND_PATHS } from '../src/cli/embeddedDispatch.js';

interface RecordedRequest {
  method: string;
  url: string;
  body: string;
  apiKey?: string;
}

describe('PersonalSkillsResource & my-skills CLI', () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl = '';
  let requests: RecordedRequest[] = [];
  let nextResponse: { status: number; body: unknown } = { status: 200, body: {} };

  beforeEach(async () => {
    requests = [];
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        requests.push({
          method: req.method ?? '',
          url: req.url ?? '',
          body: Buffer.concat(chunks).toString('utf-8'),
          apiKey: req.headers['x-alva-api-key'] as string | undefined,
        });
        res.statusCode = nextResponse.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(nextResponse.body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('bad server addr');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('lists, gets, and reads pinned revision files via /api/v1/personal-skills', async () => {
    const client = new AlvaClient({ baseUrl, apiKey: 'alva_test' });

    nextResponse = {
      status: 200,
      body: {
        skills: [
          {
            public_id: 'pskl_0123456789abcdef01234567',
            slug: 'earnings-review',
            template_ref: 'personal:pskl_0123456789abcdef01234567',
            display_name: '财报复盘',
            description: '先看现金流再看指引',
            enabled: true,
            current_rev: 2,
            content_hash: 'sha256:abc',
            source_type: 'chat',
            updated_at: '2026-11-23T12:00:00Z',
          },
        ],
        has_next_page: false,
        end_cursor: 'c1',
      },
    };
    const listed = await client.personalSkills.list({ include_disabled: true });
    expect(listed.skills).toHaveLength(1);
    expect(requests[0].url).toBe('/api/v1/personal-skills?include_disabled=true');

    nextResponse = {
      status: 200,
      body: {
        public_id: 'pskl_0123456789abcdef01234567',
        slug: 'earnings-review',
        rev: 1,
        path: 'references/checklist.md',
        content: '- FCF',
        updated_at: '2026-11-23T12:00:00Z',
      },
    };
    const f = await client.personalSkills.file(
      'personal:pskl_0123456789abcdef01234567',
      'references/checklist.md',
      { rev: 1 }
    );
    expect(f.rev).toBe(1);
    expect(requests[1].url).toBe(
      '/api/v1/personal-skills/personal%3Apskl_0123456789abcdef01234567/files/references/checklist.md?rev=1'
    );
  });

  it('rejects path traversal locally before sending request', async () => {
    const client = new AlvaClient({ baseUrl, apiKey: 'alva_test' });
    await expect(
      client.personalSkills.file('earnings-review', '../memory/user.md')
    ).rejects.toThrow(/invalid relative personal skill file path/i);
    expect(requests).toHaveLength(0);
  });

  it('saves a local skill directory via CLI my-skills save with expected-rev and request-id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'alva-my-skill-'));
    try {
      mkdirSync(join(dir, 'references'), { recursive: true });
      writeFileSync(
        join(dir, 'SKILL.md'),
        '---\nname: earnings-review\n---\nStep 1\n'
      );
      writeFileSync(join(dir, 'references', 'check.md'), '- Cash flow\n');

      nextResponse = {
        status: 201,
        body: {
          created: true,
          skill: {
            public_id: 'pskl_0123456789abcdef01234567',
            slug: 'earnings-review',
            template_ref: 'personal:pskl_0123456789abcdef01234567',
            display_name: '财报复盘',
            description: '先看现金流',
            enabled: true,
            current_rev: 1,
            content_hash: 'sha256:def',
            source_type: 'agent_link',
            updated_at: '2026-11-23T12:00:00Z',
          },
        },
      };

      const client = new AlvaClient({ baseUrl, apiKey: 'alva_test' });
      const out = await dispatchCli(client, [
        'my-skills',
        'save',
        '--slug',
        'earnings-review',
        '--display-name',
        '财报复盘',
        '--description',
        '先看现金流',
        '--source-type',
        'agent_link',
        '--source-ref',
        'agent_link:claude:~/.claude/skills/earnings-review',
        '--request-id',
        'req-1',
        '--dir',
        dir,
      ]);
      expect(String(out)).toContain('Created personal:pskl_0123456789abcdef01234567');
      const payload = JSON.parse(requests[0].body);
      expect(payload.slug).toBe('earnings-review');
      expect(payload.source_type).toBe('agent_link');
      expect(payload.request_id).toBe('req-1');
      expect(payload.files.map((x: { path: string }) => x.path).sort()).toEqual([
        'SKILL.md',
        'references/check.md',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('registers my-skills commands in ALPI embedded command paths', () => {
    expect(ALPI_ALVA_COMMAND_PATHS).toContain('my-skills list');
    expect(ALPI_ALVA_COMMAND_PATHS).toContain('my-skills get');
    expect(ALPI_ALVA_COMMAND_PATHS).toContain('my-skills file');
    expect(ALPI_ALVA_COMMAND_PATHS).toContain('my-skills save');
  });
});
