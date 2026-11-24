import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AlvaClient } from '../src/client.js';
import { dispatchCli } from '../src/cli/dispatch.js';
import {
  ALPI_ALVA_COMMAND_PATHS,
  dispatch as dispatchEmbeddedCli,
} from '../src/cli/embeddedDispatch.js';

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
  let nextResponse: { status: number; body: unknown } = {
    status: 200,
    body: {},
  };

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
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('bad server addr');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('lists, gets, and reads revision-checked files via /api/v1/personal-skills', async () => {
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
            updated_at: '2026-11-23T12:00:00Z',
          },
        ],
      },
    };
    const listed = await client.personalSkills.list({ include_disabled: true });
    expect(listed.skills).toHaveLength(1);
    expect(requests[0].url).toBe(
      '/api/v1/personal-skills?include_disabled=true'
    );

    nextResponse = {
      status: 200,
      body: {
        public_id: 'pskl_0123456789abcdef01234567',
        slug: 'earnings-review',
        rev: 2,
        path: 'references/checklist.md',
        content: '- FCF',
        updated_at: '2026-11-23T12:00:00Z',
      },
    };
    const f = await client.personalSkills.file(
      'personal:pskl_0123456789abcdef01234567',
      'references/checklist.md',
      { rev: 2 }
    );
    expect(f.rev).toBe(2);
    expect(requests[1].url).toBe(
      '/api/v1/personal-skills/personal%3Apskl_0123456789abcdef01234567/files/references/checklist.md?rev=2'
    );
  });

  it('rejects path traversal, control/bidi chars, and oversized paths locally before sending request', async () => {
    const client = new AlvaClient({ baseUrl, apiKey: 'alva_test' });
    for (const badPath of [
      '../memory/user.md',
      'references/a\nb.md',
      'references/a\u202eb.md',
      'references/<evil>.md',
      `references/${'a'.repeat(129)}.md`,
      `${'a/'.repeat(130)}b.md`,
    ]) {
      await expect(
        client.personalSkills.file('earnings-review', badPath)
      ).rejects.toThrow(/invalid relative personal skill file path/i);
    }
    expect(requests).toHaveLength(0);
  });

  it('saves a local multi-file skill directory via CLI my-skills save', async () => {
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
        '--dir',
        dir,
      ]);
      expect(String(out)).toContain(
        'Created personal:pskl_0123456789abcdef01234567'
      );
      const payload = JSON.parse(requests[0].body);
      expect(payload.slug).toBe('earnings-review');
      expect(payload.files.map((x: { path: string }) => x.path).sort()).toEqual(
        ['SKILL.md', 'references/check.md']
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('registers my-skills commands in ALPI embedded command paths and executes inline --files-json', async () => {
    expect(ALPI_ALVA_COMMAND_PATHS).toContain('my-skills list');
    expect(ALPI_ALVA_COMMAND_PATHS).toContain('my-skills get');
    expect(ALPI_ALVA_COMMAND_PATHS).toContain('my-skills file');
    expect(ALPI_ALVA_COMMAND_PATHS).toContain('my-skills save');

    nextResponse = {
      status: 200,
      body: {
        created: false,
        skill: {
          public_id: 'pskl_0123456789abcdef01234567',
          slug: 'earnings-review',
          template_ref: 'personal:pskl_0123456789abcdef01234567',
          display_name: '财报复盘',
          description: '先看现金流',
          enabled: true,
          current_rev: 2,
          content_hash: 'sha256:def',
          updated_at: '2026-11-23T12:00:00Z',
        },
      },
    };
    const client = new AlvaClient({ baseUrl, apiKey: 'alva_test' });
    const out = await dispatchEmbeddedCli(client, [
      'my-skills',
      'save',
      '--slug',
      'earnings-review',
      '--display-name',
      '财报复盘',
      '--description',
      '先看现金流',
      '--expected-rev',
      '1',
      '--files-json',
      JSON.stringify([
        {
          path: 'SKILL.md',
          content: '---\nname: earnings-review\n---\nUpdated',
        },
      ]),
    ]);
    expect(String(out)).toContain(
      'Updated personal:pskl_0123456789abcdef01234567'
    );
    const payload = JSON.parse(requests[0].body);
    expect(payload.expected_rev).toBe(1);
    expect(payload.files).toHaveLength(1);
  });

  it('exposes my-skills help and rejects invalid numeric flags before sending requests', async () => {
    const client = new AlvaClient({ baseUrl, apiKey: 'alva_test' });
    const help = (await dispatchCli(client, ['my-skills', '--help'])) as {
      _help?: boolean;
      text?: string;
    };
    expect(help._help).toBe(true);
    expect(help.text).toContain('alva my-skills');
    expect(help.text).toContain('--expected-rev');
    expect(help.text).toContain('--public-id');

    await expect(
      dispatchCli(client, [
        'my-skills',
        'save',
        '--slug',
        'earnings-review',
        '--display-name',
        'Test',
        '--description',
        'Desc',
        '--dir',
        '/tmp',
        '--files-json',
        '[{"path":"SKILL.md","content":"---\\nname: earnings-review\\n---\\nBody"}]',
      ])
    ).rejects.toThrow(/Specify only one of --dir, --skill-md, or --files-json/);

    await expect(
      dispatchCli(client, [
        'my-skills',
        'file',
        'earnings-review',
        'SKILL.md',
        '--rev',
        'abc',
      ])
    ).rejects.toThrow(/--rev must be a positive integer/);
    await expect(
      dispatchCli(client, [
        'my-skills',
        'save',
        '--slug',
        'earnings-review',
        '--display-name',
        'Test',
        '--description',
        'Desc',
        '--expected-rev',
        '0',
        '--files-json',
        '[{"path":"SKILL.md","content":"---\\nname: earnings-review\\n---\\nBody"}]',
      ])
    ).rejects.toThrow(/--expected-rev must be a positive integer/);
    expect(requests).toHaveLength(0);
  });

  it('rejects symlinks and binary files, skips dotfiles/node_modules, and preserves UTF-8 BOM', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'alva-my-skill-sec-'));
    const outside = mkdtempSync(join(tmpdir(), 'alva-outside-'));
    try {
      const secretFile = join(outside, 'secret.txt');
      writeFileSync(secretFile, 'top-secret');

      // 1. Symlink inside --dir is rejected.
      writeFileSync(join(dir, 'SKILL.md'), '---\nname: sec-test\n---\nBody\n');
      symlinkSync(secretFile, join(dir, 'leak.md'));
      const client = new AlvaClient({ baseUrl, apiKey: 'alva_test' });
      await expect(
        dispatchCli(client, [
          'my-skills',
          'save',
          '--slug',
          'sec-test',
          '--display-name',
          'Sec',
          '--description',
          'Desc',
          '--dir',
          dir,
        ])
      ).rejects.toThrow(/Refusing symbolic link/);

      // 2. Symlink as --skill-md is rejected, while files under a symlinked parent dir (e.g. ~/.claude/skills) succeed.
      await expect(
        dispatchCli(client, [
          'my-skills',
          'save',
          '--slug',
          'sec-test',
          '--display-name',
          'Sec',
          '--description',
          'Desc',
          '--skill-md',
          join(dir, 'leak.md'),
        ])
      ).rejects.toThrow(/symbolic link/);

      symlinkSync(outside, join(dir, 'symdir'));
      writeFileSync(
        join(outside, 'SKILL.md'),
        '---\nname: sec-test\n---\nOutside\n'
      );
      nextResponse = {
        status: 201,
        body: {
          created: true,
          skill: {
            public_id: 'pskl_0123456789abcdef01234567',
            slug: 'sec-test',
            template_ref: 'personal:pskl_0123456789abcdef01234567',
            display_name: 'Sec',
            description: 'Desc',
            enabled: true,
            current_rev: 1,
            content_hash: 'sha256:sym',
            updated_at: '2026-11-23T12:00:00Z',
          },
        },
      };
      await dispatchCli(client, [
        'my-skills',
        'save',
        '--slug',
        'sec-test',
        '--display-name',
        'Sec',
        '--description',
        'Desc',
        '--skill-md',
        join(dir, 'symdir', 'SKILL.md'),
      ]);
      expect(requests).toHaveLength(1);
      requests = [];
      rmSync(join(dir, 'symdir'));

      // 3. Remove symlink; binary files are rejected in v1.
      rmSync(join(dir, 'leak.md'));
      writeFileSync(
        join(dir, 'SKILL.md'),
        Buffer.concat([
          Buffer.from([0xef, 0xbb, 0xbf]),
          Buffer.from('---\nname: sec-test\n---\nBody\n', 'utf-8'),
        ])
      );
      writeFileSync(
        join(dir, '.env'),
        'OPENAI_API_KEY=sk-proj-1234567890abcdef1234567890'
      );
      mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
      writeFileSync(
        join(dir, 'node_modules', 'pkg', 'index.js'),
        'module.exports = 1;'
      );
      mkdirSync(join(dir, 'assets'), { recursive: true });
      const pngBytes = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe,
      ]);
      writeFileSync(join(dir, 'assets', 'icon.png'), pngBytes);

      await expect(
        dispatchCli(client, [
          'my-skills',
          'save',
          '--slug',
          'sec-test',
          '--display-name',
          'Sec',
          '--description',
          'Desc',
          '--dir',
          dir,
        ])
      ).rejects.toThrow(/UTF-8 text files only/);
      expect(requests).toHaveLength(0);

      // 4. After removing binary file, dotfiles and node_modules are skipped and UTF-8 BOM is preserved.
      rmSync(join(dir, 'assets'), { recursive: true, force: true });
      nextResponse = {
        status: 201,
        body: {
          created: true,
          skill: {
            public_id: 'pskl_0123456789abcdef01234567',
            slug: 'sec-test',
            template_ref: 'personal:pskl_0123456789abcdef01234567',
            display_name: 'Sec',
            description: 'Desc',
            enabled: true,
            current_rev: 1,
            content_hash: 'sha256:txt',
            updated_at: '2026-11-23T12:00:00Z',
          },
        },
      };
      await dispatchCli(client, [
        'my-skills',
        'save',
        '--slug',
        'sec-test',
        '--display-name',
        'Sec',
        '--description',
        'Desc',
        '--dir',
        dir,
      ]);
      const payload = JSON.parse(requests[0].body);
      const paths = payload.files.map((f: { path: string }) => f.path).sort();
      expect(paths).toEqual(['SKILL.md']);
      const skillEntry = payload.files.find(
        (f: { path: string }) => f.path === 'SKILL.md'
      );
      expect(skillEntry.content.startsWith('\ufeff')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
