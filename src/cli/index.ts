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
  if (!apiKey.startsWith('alva_')) {
    process.stderr?.write?.(
      'Warning: API key does not start with "alva_". This may not be a valid Alva API key.\n'
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
    if (arg.startsWith('--no-') && BOOLEAN_FLAGS.has(arg.slice(5))) {
      flags[arg.slice(5)] = 'false';
    } else if (arg.startsWith('--')) {
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

function boolFlag(val: string | undefined): boolean | undefined {
  if (val === 'true') return true;
  if (val === 'false') return false;
  return undefined;
}

function requireFlag(
  flags: Record<string, string>,
  name: string,
  command: string
): string {
  const val = flags[name];
  if (val === undefined) {
    throw new Error(`--${name} is required for '${command}'`);
  }
  return val;
}

function requireNumericFlag(
  flags: Record<string, string>,
  name: string,
  command: string
): number {
  const val = requireFlag(flags, name, command);
  const n = Number(val);
  if (Number.isNaN(n)) {
    throw new Error(
      `--${name} must be a number for '${command}', got '${val}'`
    );
  }
  return n;
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
            path: requireFlag(flags, 'path', 'fs read'),
            offset: num(flags['offset']),
            size: num(flags['size']),
          });
        case 'write':
          if (flags['file']) {
            const fileData = fs.readFileSync(flags['file']);
            return client.fs.rawWrite({
              path: requireFlag(flags, 'path', 'fs write'),
              body: fileData as unknown as BodyInit,
              mkdir_parents: boolFlag(flags['mkdir-parents']),
            });
          }
          return client.fs.write({
            path: requireFlag(flags, 'path', 'fs write'),
            data: requireFlag(flags, 'data', 'fs write'),
            mkdir_parents: boolFlag(flags['mkdir-parents']),
          });
        case 'stat':
          return client.fs.stat({
            path: requireFlag(flags, 'path', 'fs stat'),
          });
        case 'readdir':
          return client.fs.readdir({
            path: requireFlag(flags, 'path', 'fs readdir'),
            recursive: boolFlag(flags['recursive']),
          });
        case 'mkdir':
          return client.fs.mkdir({
            path: requireFlag(flags, 'path', 'fs mkdir'),
          });
        case 'remove':
          return client.fs.remove({
            path: requireFlag(flags, 'path', 'fs remove'),
            recursive: boolFlag(flags['recursive']),
          });
        case 'rename':
          return client.fs.rename({
            old_path: requireFlag(flags, 'old-path', 'fs rename'),
            new_path: requireFlag(flags, 'new-path', 'fs rename'),
          });
        case 'copy':
          return client.fs.copy({
            src_path: requireFlag(flags, 'src-path', 'fs copy'),
            dst_path: requireFlag(flags, 'dst-path', 'fs copy'),
          });
        case 'symlink':
          return client.fs.symlink({
            target_path: requireFlag(flags, 'target-path', 'fs symlink'),
            link_path: requireFlag(flags, 'link-path', 'fs symlink'),
          });
        case 'readlink':
          return client.fs.readlink({
            path: requireFlag(flags, 'path', 'fs readlink'),
          });
        case 'chmod':
          return client.fs.chmod({
            path: requireFlag(flags, 'path', 'fs chmod'),
            mode: parseInt(requireFlag(flags, 'mode', 'fs chmod'), 8),
          });
        case 'grant':
          return client.fs.grant({
            path: requireFlag(flags, 'path', 'fs grant'),
            subject: requireFlag(flags, 'subject', 'fs grant'),
            permission: requireFlag(flags, 'permission', 'fs grant'),
          });
        case 'revoke':
          return client.fs.revoke({
            path: requireFlag(flags, 'path', 'fs revoke'),
            subject: requireFlag(flags, 'subject', 'fs revoke'),
            permission: requireFlag(flags, 'permission', 'fs revoke'),
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
            name: requireFlag(flags, 'name', 'deploy create'),
            path: requireFlag(flags, 'path', 'deploy create'),
            cron_expression: requireFlag(flags, 'cron', 'deploy create'),
            args: jsonParse(flags['args']) as
              | Record<string, unknown>
              | undefined,
            push_notify: boolFlag(flags['push-notify']),
          });
        case 'list':
          return client.deploy.list({
            limit: num(flags['limit']),
            cursor: flags['cursor'],
          });
        case 'get':
          return client.deploy.get({
            id: requireNumericFlag(flags, 'id', 'deploy get'),
          });
        case 'update':
          return client.deploy.update({
            id: requireNumericFlag(flags, 'id', 'deploy update'),
            name: flags['name'],
            cron_expression: flags['cron'],
            args: jsonParse(flags['args']) as
              | Record<string, unknown>
              | undefined,
            push_notify: boolFlag(flags['push-notify']),
          });
        case 'delete':
          return client.deploy.delete({
            id: requireNumericFlag(flags, 'id', 'deploy delete'),
          });
        case 'pause':
          return client.deploy.pause({
            id: requireNumericFlag(flags, 'id', 'deploy pause'),
          });
        case 'resume':
          return client.deploy.resume({
            id: requireNumericFlag(flags, 'id', 'deploy resume'),
          });
        default:
          throw new Error(`Unknown subcommand: deploy ${subcommand}`);
      }
    }

    case 'release': {
      if (!subcommand) throw new Error('Missing subcommand for release');
      switch (subcommand) {
        case 'feed':
          return client.release.feed({
            name: requireFlag(flags, 'name', 'release feed'),
            version: requireFlag(flags, 'version', 'release feed'),
            cronjob_id: requireNumericFlag(flags, 'cronjob-id', 'release feed'),
            view_json: jsonParse(flags['view-json']) as
              | Record<string, unknown>
              | undefined,
            description: flags['description'],
          });
        case 'playbook-draft':
          return client.release.playbookDraft({
            name: requireFlag(flags, 'name', 'release playbook-draft'),
            display_name: requireFlag(
              flags,
              'display-name',
              'release playbook-draft'
            ),
            description: flags['description'],
            feeds: jsonParse(
              requireFlag(flags, 'feeds', 'release playbook-draft')
            ) as Array<{
              feed_id: number;
              feed_major?: number;
            }>,
            trading_symbols: flags['trading-symbols']
              ? (jsonParse(flags['trading-symbols']) as string[])
              : undefined,
          });
        case 'playbook':
          return client.release.playbook({
            name: requireFlag(flags, 'name', 'release playbook'),
            version: requireFlag(flags, 'version', 'release playbook'),
            feeds: jsonParse(
              requireFlag(flags, 'feeds', 'release playbook')
            ) as Array<{
              feed_id: number;
              feed_major?: number;
            }>,
            changelog: requireFlag(flags, 'changelog', 'release playbook'),
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
            name: requireFlag(flags, 'name', 'secrets create'),
            value: requireFlag(flags, 'value', 'secrets create'),
          });
        case 'list':
          return client.secrets.list();
        case 'get':
          return client.secrets.get({
            name: requireFlag(flags, 'name', 'secrets get'),
          });
        case 'update':
          return client.secrets.update({
            name: requireFlag(flags, 'name', 'secrets update'),
            value: requireFlag(flags, 'value', 'secrets update'),
          });
        case 'delete':
          return client.secrets.delete({
            name: requireFlag(flags, 'name', 'secrets delete'),
          });
        default:
          throw new Error(`Unknown subcommand: secrets ${subcommand}`);
      }
    }

    case 'sdk': {
      if (!subcommand) throw new Error('Missing subcommand for sdk');
      switch (subcommand) {
        case 'doc':
          return client.sdk.doc({
            name: requireFlag(flags, 'name', 'sdk doc'),
          });
        case 'partitions':
          return client.sdk.partitions();
        case 'partition-summary':
          return client.sdk.partitionSummary({
            partition: requireFlag(flags, 'partition', 'sdk partition-summary'),
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
            username: requireFlag(flags, 'username', 'comments create'),
            name: requireFlag(flags, 'name', 'comments create'),
            content: requireFlag(flags, 'content', 'comments create'),
            parent_id: num(flags['parent-id']),
          });
        case 'pin':
          return client.comments.pin({
            comment_id: requireNumericFlag(flags, 'comment-id', 'comments pin'),
          });
        case 'unpin':
          return client.comments.unpin({
            comment_id: requireNumericFlag(
              flags,
              'comment-id',
              'comments unpin'
            ),
          });
        default:
          throw new Error(`Unknown subcommand: comments ${subcommand}`);
      }
    }

    case 'remix':
      return client.remix.save({
        child: {
          username: requireFlag(flags, 'child-username', 'remix'),
          name: requireFlag(flags, 'child-name', 'remix'),
        },
        parents: jsonParse(requireFlag(flags, 'parents', 'remix')) as Array<{
          username: string;
          name: string;
        }>,
      });

    case 'screenshot': {
      const outFile = requireFlag(flags, 'out', 'screenshot');
      const result = await client.screenshot.capture({
        url: requireFlag(flags, 'url', 'screenshot'),
        selector: flags['selector'],
        xpath: flags['xpath'],
      });
      const buf = Buffer.from(result as ArrayBuffer);
      fs.writeFileSync(outFile, buf);
      return { written: outFile, bytes: buf.length };
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
