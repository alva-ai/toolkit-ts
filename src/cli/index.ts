import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import { Agent, setGlobalDispatcher } from 'undici';

import { AlvaClient } from '../client.js';
import { isArrayBuffer } from '../arrayBuffer.js';
import { AlvaError, CliUsageError } from '../error.js';
import { handleAuthLogin, handleAuthLoginNoBrowser } from './auth.js';
import { loadConfig, writeConfig } from './config.js';
import {
  CLI_VERSION,
  COMMAND_HELP,
  HELP_TEXT,
  dispatch as dispatchCore,
  type DispatchRuntimeDeps,
} from './dispatch.js';
import { stripGlobalFlags } from './dispatch.js';
import { parseCommand } from './commandSchema.js';
import { selectMode } from './modeSelect.js';
import { runPostConfigureHooks } from './postConfigureHooks.js';

export {
  BOOLEAN_FLAGS,
  CLI_VERSION,
  DEFAULT_RUN_TIMEOUT_MS,
  isVersionOlderThan,
  parseFlags,
  stripGlobalFlags,
} from './dispatch.js';
export type {
  AlvaCliRuntimeMode,
  DispatchLocalFiles,
  DispatchRuntimeDeps,
} from './dispatch.js';
export { CliUsageError } from '../error.js';

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
  runHooks?: (client: AlvaClient) => Promise<void>;
}

let configuredRunFetchTimeoutMs: number | undefined;

function configureFetchTimeout(timeoutMs: number): void {
  if (configuredRunFetchTimeoutMs === timeoutMs) return;
  setGlobalDispatcher(
    new Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs })
  );
  configuredRunFetchTimeoutMs = timeoutMs;
}

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const nodeRuntimeDeps: DispatchRuntimeDeps = {
  mode: 'nodejs',
  env: process.env as Record<string, string | undefined>,
  stderr: process.stderr,
  localFiles: {
    readText: (path) => fs.readFileSync(path, 'utf-8'),
    readBytes: (path) => fs.readFileSync(path) as unknown as BodyInit,
    writeBytes: (path, data) => fs.writeFileSync(path, data),
  },
  readStdin: readAllStdin,
  randomUUID: () => crypto.randomUUID(),
  configureFetchTimeout,
  writeBrokerResult: async (envelope, exitCode) => {
    await new Promise<void>((resolve) => {
      process.stdout.write(JSON.stringify(envelope) + '\n', () => resolve());
    });
    process.exitCode = exitCode;
  },
};

export async function dispatch(
  client: AlvaClient,
  args: string[],
  meta?: { profile?: string; baseUrl?: string; cliVersion?: string },
  deps?: DispatchRuntimeDeps
): Promise<unknown> {
  return dispatchCore(client, args, meta, {
    ...nodeRuntimeDeps,
    ...deps,
    localFiles: deps?.localFiles ?? nodeRuntimeDeps.localFiles,
  });
}

export async function handleConfigure(
  args: string[],
  deps?: WriteConfigDeps
): Promise<{
  status: string;
  apiKey: string;
  baseUrl?: string;
  profile: string;
}> {
  const flags = parseCommand(args).flags;
  const apiKey = flags['api-key'];
  if (!apiKey) throw new CliUsageError('--api-key is required', 'configure');
  if (!apiKey.startsWith('alva_')) {
    process.stderr.write(
      'Warning: API key does not start with "alva_". This may not be a valid Alva API key.\n'
    );
  }

  const baseUrl = flags['base-url'];
  const profileName = flags['profile'] || 'default';
  const configInput: { apiKey: string; baseUrl?: string } = { apiKey };
  if (baseUrl) configInput.baseUrl = baseUrl;
  const writeDeps = deps ?? {
    env: process.env as Record<string, string | undefined>,
    homedir: () => os.homedir(),
    mkdir: (path: string, options: { recursive: boolean }) =>
      fsPromises.mkdir(path, options).then(() => undefined),
    writeFile: (path: string, data: string, options: { mode: number }) =>
      fsPromises.writeFile(path, data, options).then(() => undefined),
    readFile: (path: string) => fsPromises.readFile(path, 'utf8'),
  };
  const result = await writeConfig(configInput, writeDeps, profileName);
  const client = new AlvaClient(baseUrl ? { apiKey, baseUrl } : { apiKey });
  const runHooks =
    writeDeps.runHooks ?? ((value: AlvaClient) => runPostConfigureHooks(value));
  try {
    await runHooks(client);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`warning: post-configure hooks crashed: ${message}\n`);
  }
  return {
    status: 'configured',
    apiKey: result.apiKey!,
    baseUrl: result.baseUrl,
    profile: profileName,
  };
}

function booleanFlag(value: string | undefined): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

async function main(): Promise<void> {
  try {
    const rawArgs = process.argv.slice(2);
    if (rawArgs[0] === '-v' || rawArgs[0] === '--version') {
      process.stdout.write(`alva version ${CLI_VERSION}\n`);
      return;
    }
    if (rawArgs[0] === 'configure') {
      if (rawArgs[1] === '--help' || rawArgs[1] === '-h') {
        process.stdout.write(COMMAND_HELP.configure + '\n');
        return;
      }
      process.stdout.write(
        JSON.stringify(await handleConfigure(rawArgs), null, 2) + '\n'
      );
      return;
    }
    if (rawArgs[0] === 'auth') {
      const parsedAuth = parseCommand(rawArgs);
      const authSub = parsedAuth.path[1];
      if (!authSub || parsedAuth.flags.help !== undefined) {
        process.stdout.write(`${COMMAND_HELP.auth}\n`);
        return;
      }
      if (authSub === 'login') {
        const mode = selectMode(
          process.env as Record<string, string | undefined>,
          {
            noBrowser: booleanFlag(parsedAuth.flags['no-browser']) === true,
            browser: booleanFlag(parsedAuth.flags.browser) === true,
          },
          process.platform
        );
        const result =
          mode === 'no-browser'
            ? await handleAuthLoginNoBrowser(rawArgs)
            : await handleAuthLogin(rawArgs);
        const keyHint = `${result.apiKey.slice(0, 13)}...`;
        process.stdout.write(
          `Logged in as profile "${result.profile}" (api key ${keyHint}).\n`,
          () => process.exit(0)
        );
        return;
      }
      process.stdout.write(`${COMMAND_HELP.auth}\n`);
      return;
    }

    const config = loadConfig({
      argv: rawArgs,
      env: process.env as Record<string, string | undefined>,
      readFile: (path: string) => fs.readFileSync(path, 'utf8'),
      homedir: () => os.homedir(),
    });
    const client = new AlvaClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      arraysBaseUrl: config.arraysBaseUrl,
      gaClientId: config.gaClientId,
      gaSessionId: config.gaSessionId,
      utmParams: config.utmParams,
      originSessionId: config.originSessionId,
      originSessionKind: config.originSessionKind,
    });
    const result = await dispatch(client, stripGlobalFlags(rawArgs), {
      profile: config.profile,
      baseUrl: config.baseUrl,
      cliVersion: CLI_VERSION,
    });
    if (result && typeof result === 'object' && '_warning' in result) {
      process.stderr.write((result as { _warning: string })._warning + '\n');
      delete (result as Record<string, unknown>)._warning;
    }
    if (result && typeof result === 'object' && '_help' in result) {
      process.stdout.write((result as unknown as { text: string }).text + '\n');
      return;
    }
    if (
      result &&
      typeof result === 'object' &&
      (result as Record<string, unknown>)._cliOutput !== undefined
    ) {
      const output = (result as { _cliOutput: string })._cliOutput;
      process.stdout.write(output + (output.endsWith('\n') ? '' : '\n'));
      process.exitCode = (result as { _exitCode: number })._exitCode;
      return;
    }
    if (
      result &&
      typeof result === 'object' &&
      (result as Record<string, unknown>)._image === true &&
      typeof (result as Record<string, unknown>).data === 'string'
    ) {
      process.stdout.write((result as { data: string }).data + '\n');
      return;
    }
    if (isArrayBuffer(result)) {
      process.stdout.write(Buffer.from(result));
    } else if (typeof result === 'string') {
      process.stdout.write(result);
    } else if (result !== undefined) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error instanceof CliUsageError) {
      const help = error.command ? COMMAND_HELP[error.command] : HELP_TEXT;
      process.stderr.write(`Error: ${error.message}\n`);
      if (help) process.stderr.write(`\n${help}\n`);
      process.exitCode = 1;
    } else if (error instanceof AlvaError) {
      process.stderr.write(
        `${JSON.stringify(
          {
            error: {
              code: error.code,
              message: error.message,
              status: error.status,
              ...(error.details !== undefined
                ? { details: error.details }
                : {}),
            },
          },
          null,
          2
        )}\n`
      );
      process.exitCode = 1;
    } else {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Error: ${message}\n`);
      process.exitCode = 1;
    }
  }
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('cli.mjs') ||
    process.argv[1].endsWith('cli.js') ||
    process.argv[1].endsWith('/alva') ||
    process.argv[1].endsWith('\\alva'));
if (isDirectRun) void main();
