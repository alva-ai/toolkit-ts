import * as crypto from 'node:crypto';
import * as http from 'node:http';
import { exec } from 'node:child_process';
import * as os from 'node:os';
import * as fsPromises from 'node:fs/promises';
import { writeConfig } from './config.js';

export function generateState(): string {
  return crypto.randomBytes(32).toString('hex');
}

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

export interface AuthLoginDeps {
  generateState: () => string;
  openBrowser: (url: string) => Promise<void>;
  writeConfigDeps: WriteConfigDeps;
  createServer: (handler: http.RequestListener) => http.Server;
  timeout?: number;
  log: (msg: string) => void;
}

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        flags[arg.slice(2)] = argv[i + 1];
        i++;
      }
    }
  }
  return flags;
}

function defaultOpenBrowser(url: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const platform = process.platform;
    let cmd: string;
    if (platform === 'darwin') {
      cmd = `open "${url}"`;
    } else if (platform === 'win32') {
      cmd = `start "${url}"`;
    } else {
      cmd = `xdg-open "${url}"`;
    }
    exec(cmd, () => {
      resolve();
    });
  });
}

function defaultDeps(): AuthLoginDeps {
  return {
    generateState,
    openBrowser: defaultOpenBrowser,
    writeConfigDeps: {
      env: process.env as Record<string, string | undefined>,
      homedir: () => os.homedir(),
      mkdir: (path: string, options: { recursive: boolean }) =>
        fsPromises.mkdir(path, options).then(() => undefined),
      writeFile: (path: string, data: string, options: { mode: number }) =>
        fsPromises.writeFile(path, data, options).then(() => undefined),
      readFile: (path: string) => fsPromises.readFile(path, 'utf-8'),
    },
    createServer: (handler: http.RequestListener) => http.createServer(handler),
    timeout: 120_000,
    log: (msg: string) => process.stderr.write(msg),
  };
}

export interface AuthLoginResult {
  status: string;
  apiKey: string;
  profile: string;
}

export async function handleAuthLogin(
  args: string[],
  deps?: Partial<AuthLoginDeps>
): Promise<AuthLoginResult> {
  const d = { ...defaultDeps(), ...deps };
  const flags = parseFlags(args.slice(1));
  const profileName = flags.profile || 'default';
  const authUrl = flags['auth-url'] || 'https://alva.ai';
  const timeout = d.timeout ?? 120_000;

  const state = d.generateState();

  return new Promise<AuthLoginResult>((resolve, reject) => {
    const server = d.createServer((req, res) => {
      const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const callbackState = reqUrl.searchParams.get('state');
      const apiKey = reqUrl.searchParams.get('api_key');

      if (callbackState !== state) {
        res.writeHead(400);
        res.end(
          '<html><body><h1>Error</h1><p>State mismatch. Please try again.</p></body></html>'
        );
        return;
      }

      if (!apiKey) {
        res.writeHead(400);
        res.end(
          '<html><body><h1>Error</h1><p>Missing API key. Please try again.</p></body></html>'
        );
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:rgba(246,246,246,1);font-family:system-ui,sans-serif"><div style="text-align:center;display:flex;flex-direction:column;align-items:center;gap:40px"><h1 style="font-size:45px;font-weight:400;line-height:120%;margin:0">Turn Ideas into Live<br>Investing Playbooks in Minutes</h1><p style="font-size:24px;font-weight:400;margin:0">You\'re all set for Alva.</p></div></body></html>'
      );

      server.close();
      clearTimeout(timer);

      writeConfig({ apiKey }, d.writeConfigDeps, profileName).then(() => {
        resolve({ status: 'logged_in', apiKey, profile: profileName });
      }, reject);
    });

    server.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      const callbackUrl = `http://127.0.0.1:${addr.port}/callback`;
      const loginUrl = `${authUrl}/authorize?callback_url=${encodeURIComponent(callbackUrl)}&state=${state}`;
      d.log(
        `Opening browser...\nIf it doesn't open, visit:\n${loginUrl}\n\nWaiting for login callback...\n`
      );
      d.openBrowser(loginUrl).catch(() => {
        // Swallow browser open errors
      });
    });

    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Login timed out waiting for callback'));
    }, timeout);
  });
}
