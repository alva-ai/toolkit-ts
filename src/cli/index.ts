import { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { loadConfig, writeConfig } from './config.js';
import * as fs from 'fs';
import * as os from 'os';
import * as fsPromises from 'fs/promises';

const HELP_TEXT = `Usage: alva <command> [options]

Commands:
  configure   Save API key and endpoint to config file
  user        User profile operations
  fs          Filesystem operations
  run         Execute code
  deploy      Cronjob management
  release     Feed and playbook releases
  secrets     Secret management
  sdk         SDK documentation
  comments    Playbook comments
  remix       Playbook remixing
  screenshot  Capture web screenshots

Global options:
  --api-key <key>    API key (overrides config file)
  --base-url <url>   API base URL (overrides config file)
  --help             Show this help message`;

interface WriteConfigDeps {
  env: Record<string, string | undefined>;
  homedir: () => string;
  mkdir: (path: string, options: { recursive: boolean }) => Promise<void>;
  writeFile: (
    path: string,
    data: string,
    options: { mode: number }
  ) => Promise<void>;
  readFile: (path: string) => Promise<string>;
}

export async function handleConfigure(
  args: string[],
  deps?: WriteConfigDeps
): Promise<{ status: string; apiKey: string; baseUrl?: string }> {
  const flags = parseFlags(args.slice(1));
  const apiKey = flags['api-key'];
  if (!apiKey) {
    throw new Error(
      '--api-key is required. Usage: alva configure --api-key <key> [--base-url <url>]'
    );
  }
  const baseUrl = flags['base-url'];
  const configInput: { apiKey: string; baseUrl?: string } = { apiKey };
  if (baseUrl) configInput.baseUrl = baseUrl;

  const writeDeps = deps ?? {
    env: process.env as Record<string, string | undefined>,
    homedir: () => os.homedir(),
    mkdir: (path: string, options: { recursive: boolean }) =>
      fsPromises.mkdir(path, options).then(() => undefined),
    writeFile: (path: string, data: string, options: { mode: number }) =>
      fsPromises.writeFile(path, data, options).then(() => undefined),
    readFile: (path: string) => fsPromises.readFile(path, 'utf-8'),
  };

  const result = await writeConfig(configInput, writeDeps);
  return {
    status: 'configured',
    apiKey: result.apiKey!,
    baseUrl: result.baseUrl,
  };
}

const BOOLEAN_FLAGS = new Set(['recursive', 'mkdir-parents', 'push-notify']);

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (BOOLEAN_FLAGS.has(arg.slice(2))) {
        flags[arg.slice(2)] = 'true';
      } else if (i + 1 < argv.length) {
        flags[arg.slice(2)] = argv[i + 1];
        i++;
      }
    }
  }
  return flags;
}

function num(val: string | undefined): number | undefined {
  if (val === undefined) return undefined;
  const n = Number(val);
  return Number.isNaN(n) ? undefined : n;
}

function jsonParse(val: string | undefined): unknown {
  if (val === undefined) return undefined;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
}

export async function dispatch(
  client: AlvaClient,
  args: string[]
): Promise<unknown> {
  const group = args[0];

  if (!group || group === '--help' || group === '-h') {
    return { _help: true, text: HELP_TEXT };
  }

  const subcommand = args[1];
  const flags = parseFlags(
    args.slice(
      group === 'run' || group === 'remix' || group === 'screenshot' ? 1 : 2
    )
  );

  switch (group) {
    case 'user':
      if (!subcommand) throw new Error('Missing subcommand for user');
      if (subcommand === 'me') return client.user.me();
      throw new Error(`Unknown subcommand: user ${subcommand}`);

    case 'fs': {
      if (!subcommand) throw new Error('Missing subcommand for fs');
      switch (subcommand) {
        case 'read':
          return client.fs.read({
            path: flags['path'],
            offset: num(flags['offset']),
            size: num(flags['size']),
          });
        case 'write':
          if (flags['file']) {
            // Raw write mode: read file from disk and upload as binary
            const fileData = fs.readFileSync(flags['file']);
            return client.fs.rawWrite({
              path: flags['path'],
              body: fileData as unknown as BodyInit,
              mkdir_parents:
                flags['mkdir-parents'] === 'true' ? true : undefined,
            });
          }
          return client.fs.write({
            path: flags['path'],
            data: flags['data'],
            mkdir_parents: flags['mkdir-parents'] === 'true' ? true : undefined,
          });
        case 'stat':
          return client.fs.stat({ path: flags['path'] });
        case 'readdir':
          return client.fs.readdir({
            path: flags['path'],
            recursive: flags['recursive'] === 'true' ? true : undefined,
          });
        case 'mkdir':
          return client.fs.mkdir({ path: flags['path'] });
        case 'remove':
          return client.fs.remove({
            path: flags['path'],
            recursive: flags['recursive'] === 'true' ? true : undefined,
          });
        case 'rename':
          return client.fs.rename({
            old_path: flags['old-path'],
            new_path: flags['new-path'],
          });
        case 'copy':
          return client.fs.copy({
            src_path: flags['src-path'],
            dst_path: flags['dst-path'],
          });
        case 'symlink':
          return client.fs.symlink({
            target_path: flags['target-path'],
            link_path: flags['link-path'],
          });
        case 'readlink':
          return client.fs.readlink({ path: flags['path'] });
        case 'chmod':
          return client.fs.chmod({
            path: flags['path'],
            mode: parseInt(flags['mode'], 8),
          });
        case 'grant':
          return client.fs.grant({
            path: flags['path'],
            subject: flags['subject'],
            permission: flags['permission'],
          });
        case 'revoke':
          return client.fs.revoke({
            path: flags['path'],
            subject: flags['subject'],
            permission: flags['permission'],
          });
        default:
          throw new Error(`Unknown subcommand: fs ${subcommand}`);
      }
    }

    case 'run':
      return client.run.execute({
        code: flags['code'],
        entry_path: flags['entry-path'],
        working_dir: flags['working-dir'],
        args: jsonParse(flags['args']) as Record<string, unknown> | undefined,
      });

    case 'deploy': {
      if (!subcommand) throw new Error('Missing subcommand for deploy');
      switch (subcommand) {
        case 'create':
          return client.deploy.create({
            name: flags['name'],
            path: flags['path'],
            cron_expression: flags['cron'],
            args: jsonParse(flags['args']) as
              | Record<string, unknown>
              | undefined,
            push_notify: flags['push-notify'] === 'true' ? true : undefined,
          });
        case 'list':
          return client.deploy.list({
            limit: num(flags['limit']),
            cursor: flags['cursor'],
          });
        case 'get':
          return client.deploy.get({ id: Number(flags['id']) });
        case 'update':
          return client.deploy.update({
            id: Number(flags['id']),
            name: flags['name'],
            cron_expression: flags['cron'],
            args: jsonParse(flags['args']) as
              | Record<string, unknown>
              | undefined,
            push_notify: flags['push-notify'] === 'true' ? true : undefined,
          });
        case 'delete':
          return client.deploy.delete({ id: Number(flags['id']) });
        case 'pause':
          return client.deploy.pause({ id: Number(flags['id']) });
        case 'resume':
          return client.deploy.resume({ id: Number(flags['id']) });
        default:
          throw new Error(`Unknown subcommand: deploy ${subcommand}`);
      }
    }

    case 'release': {
      if (!subcommand) throw new Error('Missing subcommand for release');
      switch (subcommand) {
        case 'feed':
          return client.release.feed({
            name: flags['name'],
            version: flags['version'],
            cronjob_id: Number(flags['cronjob-id']),
            view_json: jsonParse(flags['view-json']) as
              | Record<string, unknown>
              | undefined,
            description: flags['description'],
          });
        case 'playbook-draft':
          return client.release.playbookDraft({
            name: flags['name'],
            display_name: flags['display-name'],
            description: flags['description'],
            feeds: jsonParse(flags['feeds']) as Array<{
              feed_id: number;
              feed_major?: number;
            }>,
            trading_symbols: flags['trading-symbols']
              ? (jsonParse(flags['trading-symbols']) as string[])
              : undefined,
          });
        case 'playbook':
          return client.release.playbook({
            name: flags['name'],
            version: flags['version'],
            feeds: jsonParse(flags['feeds']) as Array<{
              feed_id: number;
              feed_major?: number;
            }>,
            changelog: flags['changelog'],
          });
        default:
          throw new Error(`Unknown subcommand: release ${subcommand}`);
      }
    }

    case 'secrets': {
      if (!subcommand) throw new Error('Missing subcommand for secrets');
      switch (subcommand) {
        case 'create':
          return client.secrets.create({
            name: flags['name'],
            value: flags['value'],
          });
        case 'list':
          return client.secrets.list();
        case 'get':
          return client.secrets.get({ name: flags['name'] });
        case 'update':
          return client.secrets.update({
            name: flags['name'],
            value: flags['value'],
          });
        case 'delete':
          return client.secrets.delete({ name: flags['name'] });
        default:
          throw new Error(`Unknown subcommand: secrets ${subcommand}`);
      }
    }

    case 'sdk': {
      if (!subcommand) throw new Error('Missing subcommand for sdk');
      switch (subcommand) {
        case 'doc':
          return client.sdk.doc({ name: flags['name'] });
        case 'partitions':
          return client.sdk.partitions();
        case 'partition-summary':
          return client.sdk.partitionSummary({
            partition: flags['partition'],
          });
        default:
          throw new Error(`Unknown subcommand: sdk ${subcommand}`);
      }
    }

    case 'comments': {
      if (!subcommand) throw new Error('Missing subcommand for comments');
      switch (subcommand) {
        case 'create':
          return client.comments.create({
            username: flags['username'],
            name: flags['name'],
            content: flags['content'],
            parent_id: num(flags['parent-id']),
          });
        case 'pin':
          return client.comments.pin({
            comment_id: Number(flags['comment-id']),
          });
        case 'unpin':
          return client.comments.unpin({
            comment_id: Number(flags['comment-id']),
          });
        default:
          throw new Error(`Unknown subcommand: comments ${subcommand}`);
      }
    }

    case 'remix':
      return client.remix.save({
        child: {
          username: flags['child-username'],
          name: flags['child-name'],
        },
        parents: jsonParse(flags['parents']) as Array<{
          username: string;
          name: string;
        }>,
      });

    case 'screenshot': {
      if (!flags['out']) {
        throw new Error(
          'screenshot requires --out <file> to write the PNG output'
        );
      }
      const result = await client.screenshot.capture({
        url: flags['url'],
        selector: flags['selector'],
        xpath: flags['xpath'],
      });
      const buf = Buffer.from(result as ArrayBuffer);
      fs.writeFileSync(flags['out'], buf);
      return { written: flags['out'], bytes: buf.length };
    }

    default:
      throw new Error(`Unknown command: ${group}`);
  }
}

async function main() {
  try {
    const rawArgs = process.argv.slice(2);

    // Handle configure before loading config (doesn't need existing auth)
    if (rawArgs[0] === 'configure') {
      const result = await handleConfigure(rawArgs);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }

    const config = loadConfig({
      argv: rawArgs,
      env: process.env as Record<string, string | undefined>,
      readFile: (path: string) => fs.readFileSync(path, 'utf-8'),
      homedir: () => os.homedir(),
    });

    const client = new AlvaClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    });

    // Remove --api-key and --base-url flags (both --flag value and --flag=value forms)
    const cleanArgs: string[] = [];
    for (let i = 0; i < rawArgs.length; i++) {
      const a = rawArgs[i];
      if (a === '--api-key' || a === '--base-url') {
        i++; // skip the next arg (the value)
        continue;
      }
      if (a.startsWith('--api-key=') || a.startsWith('--base-url=')) {
        continue;
      }
      cleanArgs.push(a);
    }

    const result = await dispatch(client, cleanArgs);
    if (result && typeof result === 'object' && '_help' in result) {
      const helpResult = result as unknown as { text: string };
      process.stdout.write(helpResult.text + '\n');
      return;
    }
    if (result !== undefined) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (err) {
    const error =
      err instanceof AlvaError
        ? { code: err.code, message: err.message, status: err.status }
        : {
            code: 'CLI_ERROR',
            message: err instanceof Error ? err.message : String(err),
          };
    process.stderr.write(JSON.stringify({ error }, null, 2) + '\n');
    process.exit(1);
  }
}

// Run main() when executed as a script (node cli.js or via symlinked `alva` binary),
// but not when imported for testing (vitest imports dispatch directly).
const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('cli.mjs') ||
    process.argv[1].endsWith('cli.js') ||
    process.argv[1].endsWith('/alva') ||
    process.argv[1].endsWith('\\alva'));
if (isDirectRun) {
  main();
}
