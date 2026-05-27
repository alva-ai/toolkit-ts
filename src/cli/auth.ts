import * as crypto from 'node:crypto';
import * as http from 'node:http';
import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as fsPromises from 'node:fs/promises';
import * as readline from 'node:readline';
import { writeConfig } from './config.js';
import { generateCodeVerifier, deriveChallenge } from './pkce.js';

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

/**
 * Minimal fetch-like surface used by the auth flow so tests can inject a mock
 * without touching the network. Mirrors the subset of `globalThis.fetch` we
 * actually call.
 */
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export interface AuthLoginDeps {
  generateState: () => string;
  generateCodeVerifier: () => string;
  openBrowser: (url: string) => Promise<void>;
  writeConfigDeps: WriteConfigDeps;
  // Listener for the localhost callback path. The auto-opened browser
  // is sent to a `redirect_uri=http://127.0.0.1:<port>/callback` URL,
  // so when the user logs in locally the listener catches the code
  // and finishes without any manual step.
  createServer: (handler: http.RequestListener) => http.Server;
  timeout?: number;
  log: (msg: string) => void;
  fetch: FetchLike;
  // Readline for the OOB paste path. The terminal also prints an
  // OOB-redirect authorize URL so a user on a different device can
  // open it, see the code on the display page, and paste it back here.
  readline?: (prompt?: string) => Promise<string>;
}

/**
 * Deps for the no-browser (Mode B) login flow. Reuses most of
 * `AuthLoginDeps` for the shared pieces (state/verifier generation,
 * writeConfigDeps, log, fetch) and adds:
 *
 * - `readline`: returns a single line of user input (already stripped
 *   of the trailing newline). Injected so tests can drive the flow
 *   without touching stdin.
 * - `oobRedirectUrl`: the static "out-of-band" callback page where the
 *   frontend displays the `code` for the user to copy. Used both in
 *   the printed authorize URL and in the `/oauth/token` redirect_uri.
 *   When undefined (the default), the URL is derived from `--auth-url`
 *   as `${origin}/oauth/code/callback`, so `--auth-url https://stg.alva.xyz`
 *   automatically points at the stg OOB page instead of prod. Set
 *   explicitly only in tests.
 */
export interface AuthLoginNoBrowserDeps {
  generateState: () => string;
  generateCodeVerifier: () => string;
  writeConfigDeps: WriteConfigDeps;
  log: (msg: string) => void;
  fetch: FetchLike;
  readline: (prompt?: string) => Promise<string>;
  oobRedirectUrl?: string;
}

const DEFAULT_BASE_URL = 'https://api-llm.prd.alva.ai';
const DEFAULT_AUTH_URL = 'https://alva.ai';
const CLIENT_ID = 'alva-cli';
const SCOPE = 'cli';

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
  // Use spawn with an args array — never the shell — so the URL is
  // passed verbatim regardless of `&`, `?`, `=`, `%`, etc. With
  // exec(`open "${url}"`) macOS occasionally misinterprets the
  // argument (e.g. when special characters trip shell quoting) and
  // falls back to opening Finder. spawn(['open', url]) avoids that.
  //
  // On macOS, `-u <url>` forces URL handler resolution explicitly so
  // there's no chance of `open` treating the argument as a filename.
  const platform = process.platform;
  let cmd: string;
  let args: string[];
  if (platform === 'darwin') {
    cmd = 'open';
    args = ['-u', url];
  } else if (platform === 'win32') {
    // cmd.exe's `start` needs an empty title arg before the URL so
    // the URL isn't interpreted as the window title.
    cmd = 'cmd.exe';
    args = ['/c', 'start', '', url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }
  return new Promise<void>((resolve) => {
    try {
      const proc = spawn(cmd, args, { stdio: 'ignore', detached: true });
      proc.on('error', () => resolve());
      proc.unref();
      resolve();
    } catch {
      resolve();
    }
  });
}

function defaultDeps(): AuthLoginDeps {
  return {
    generateState,
    generateCodeVerifier,
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
    fetch: ((url: string, init?: RequestInit) =>
      // Node 18+ provides a global fetch; cast through unknown for the
      // narrowed FetchLike surface.
      (globalThis.fetch as unknown as FetchLike)(
        url,
        init as Parameters<FetchLike>[1]
      )) as FetchLike,
    readline: defaultReadline,
  };
}

export interface AuthLoginResult {
  status: string;
  apiKey: string;
  profile: string;
}

/**
 * Build the `${authUrl}/authorize?...` URL the user is sent to (Mode A and
 * Mode B share this builder; only the `redirect_uri` differs).
 *
 * Exported so T14 (no-browser mode) can reuse without duplicating the
 * encoding logic.
 */
export function buildAuthorizeUrl(params: {
  authUrl: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const u = new URL(`${params.authUrl.replace(/\/$/, '')}/authorize`);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', CLIENT_ID);
  u.searchParams.set('redirect_uri', params.redirectUri);
  u.searchParams.set('code_challenge', params.codeChallenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('state', params.state);
  u.searchParams.set('scope', SCOPE);
  return u.toString();
}

/**
 * Exchange a short-lived OAuth `code` for a real API key by POSTing to
 * `${baseUrl}/oauth/token` with PKCE verifier.
 *
 * Exported so T14 (no-browser mode) can reuse without duplicating the
 * request/response shape and error handling.
 *
 * Throws on non-2xx or on missing `api_key` in the response.
 */
export async function exchangeCodeForApiKey(params: {
  baseUrl: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  fetch: FetchLike;
}): Promise<string> {
  // Gateway mounts the OAuth-CLI handler on the `/api/v1` router group
  // (sibling to /api/v1/discord). The full path is /api/v1/oauth/token —
  // matching the discord OAuth callback's mount.
  const tokenUrl = `${params.baseUrl.replace(/\/$/, '')}/api/v1/oauth/token`;
  const res = await params.fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: params.code,
      code_verifier: params.codeVerifier,
      redirect_uri: params.redirectUri,
      client_id: CLIENT_ID,
    }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as {
        error?: string;
        error_description?: string;
      };
      detail = body?.error_description
        ? `${body.error ?? 'error'}: ${body.error_description}`
        : (body?.error ?? `HTTP ${res.status}`);
    } catch {
      try {
        detail = await res.text();
      } catch {
        detail = `HTTP ${res.status}`;
      }
    }
    throw new Error(`Token exchange failed: ${detail}`);
  }

  const body = (await res.json()) as { api_key?: string };
  if (!body.api_key) {
    throw new Error('Token exchange response missing api_key');
  }
  return body.api_key;
}

const SUCCESS_HTML =
  '<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:rgba(246,246,246,1);font-family:system-ui,sans-serif"><div style="text-align:center;display:flex;flex-direction:column;align-items:center;gap:40px"><h1 style="font-size:45px;font-weight:400;line-height:120%;margin:0">Turn Ideas into Live<br>Investing Playbooks in Minutes</h1><p style="font-size:24px;font-weight:400;margin:0">You\'re all set for Alva.</p></div></body></html>';

/**
 * Mode A: dual-URL race between a localhost listener (auto-complete
 * when the user logs in on this machine's default browser) and an
 * out-of-band paste flow (when the user opens the URL on a different
 * device).
 *
 * Two authorize URLs are issued from the same PKCE challenge:
 *   - local:  redirect_uri = http://127.0.0.1:<port>/callback. Fired
 *             into openBrowser as a convenience. If consent completes
 *             here, the listener catches the callback and exchanges
 *             with the localhost redirect_uri.
 *   - oob:    redirect_uri = ${authUrl-origin}/oauth/code/callback.
 *             Printed to stderr. If the user opens it on another
 *             device, the frontend redirects to the OOB display page
 *             which shows the code; user pastes it back here. The
 *             paste path exchanges with the OOB redirect_uri.
 *
 * Two codes are minted at consent time (one per redirect_uri); the
 * other one expires unused. Whichever path resolves first wins.
 */
export async function handleAuthLogin(
  args: string[],
  deps?: Partial<AuthLoginDeps>
): Promise<AuthLoginResult> {
  const d = { ...defaultDeps(), ...deps };
  const flags = parseFlags(args.slice(1));
  const profileName = flags.profile || 'default';
  const authUrl = flags['auth-url'] || DEFAULT_AUTH_URL;
  const baseUrl = flags['base-url'] || DEFAULT_BASE_URL;
  const oobRedirectUrl = deriveOobRedirectUrl(authUrl);
  const timeout = d.timeout ?? 120_000;

  const state = d.generateState();
  const codeVerifier = d.generateCodeVerifier();
  const codeChallenge = deriveChallenge(codeVerifier);

  return new Promise<AuthLoginResult>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    // Listener path: localhost callback. The redirect_uri here is
    // bound to the *local* code at issue time, so the exchange uses
    // localhost too.
    const server = d.createServer((req, res) => {
      const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const callbackState = reqUrl.searchParams.get('state');
      const code = reqUrl.searchParams.get('code');
      const errorParam = reqUrl.searchParams.get('error');

      if (callbackState !== state) {
        res.writeHead(400);
        res.end(
          '<html><body><h1>Error</h1><p>State mismatch. Please try again.</p></body></html>'
        );
        return;
      }

      if (errorParam) {
        const desc = reqUrl.searchParams.get('error_description') ?? '';
        const friendly =
          errorParam === 'access_denied'
            ? 'You declined the authorization request. Run `alva auth login` again to retry.'
            : desc || `OAuth error: ${errorParam}`;
        res.writeHead(400);
        res.end(
          `<html><body><h1>Login declined</h1><p>${friendly}</p><p>You can close this window and return to your terminal.</p></body></html>`
        );
        settle(() => {
          server.close();
          reject(new Error(friendly));
        });
        return;
      }

      if (!code) {
        res.writeHead(400);
        res.end(
          '<html><body><h1>Error</h1><p>Missing authorization code. Please try again.</p></body></html>'
        );
        return;
      }

      const localRedirectUri = `http://127.0.0.1:${(server.address() as { port: number }).port}/callback`;

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(SUCCESS_HTML);

      exchangeCodeForApiKey({
        baseUrl,
        code,
        codeVerifier,
        redirectUri: localRedirectUri,
        fetch: d.fetch,
      })
        .then(async (apiKey) => {
          if (settled) return;
          await writeConfig({ apiKey }, d.writeConfigDeps, profileName);
          settle(() => {
            server.close();
            resolve({ status: 'logged_in', apiKey, profile: profileName });
          });
        })
        .catch((err) => {
          settle(() => {
            server.close();
            reject(err);
          });
        });
    });

    server.on('error', (err) => {
      settle(() => reject(err));
    });

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      const localRedirectUri = `http://127.0.0.1:${port}/callback`;
      const localUrl = buildAuthorizeUrl({
        authUrl,
        redirectUri: localRedirectUri,
        state,
        codeChallenge,
      });
      const oobUrl = buildAuthorizeUrl({
        authUrl,
        redirectUri: oobRedirectUrl,
        state,
        codeChallenge,
      });

      // Only the OOB URL is shown to the user — that's the link they
      // can copy to another device and end up at a code-display page.
      // The local URL is silently fed to openBrowser; if consent
      // completes there, the listener auto-completes without the
      // user touching the terminal again.
      d.log(
        [
          '',
          'Open this URL in any browser to log in:',
          '',
          `  ${oobUrl}`,
          '',
          'After approving, paste the code shown on the page (a local',
          'browser, if available, will complete the login automatically):',
          '',
        ].join('\n')
      );
      d.openBrowser(localUrl).catch(() => {
        // Swallow open errors — the printed URL is the explicit path.
      });

      // Paste path: exchange uses the OOB redirect_uri because that's
      // the URL the user followed.
      const tryPasteLoop = d.readline;
      if (tryPasteLoop) {
        (async () => {
          for (let attempt = 0; attempt < MAX_PASTE_ATTEMPTS; attempt++) {
            if (settled) return;
            let raw: string;
            try {
              raw = await tryPasteLoop('> ');
            } catch {
              return;
            }
            if (settled) return;
            const code = extractCodeFromInput(raw);
            if (!code) {
              if (attempt < MAX_PASTE_ATTEMPTS - 1) {
                d.log("Couldn't find a code in that input. Try again.\n");
              }
              continue;
            }
            try {
              const apiKey = await exchangeCodeForApiKey({
                baseUrl,
                code,
                codeVerifier,
                redirectUri: oobRedirectUrl,
                fetch: d.fetch,
              });
              if (settled) return;
              await writeConfig({ apiKey }, d.writeConfigDeps, profileName);
              settle(() => {
                server.close();
                resolve({ status: 'logged_in', apiKey, profile: profileName });
              });
              return;
            } catch (err) {
              if (settled) return;
              const msg = err instanceof Error ? err.message : String(err);
              if (!/invalid_grant/i.test(msg)) {
                settle(() => {
                  server.close();
                  reject(err instanceof Error ? err : new Error(msg));
                });
                return;
              }
              if (attempt < MAX_PASTE_ATTEMPTS - 1) {
                d.log("That code didn't work. Try again.\n");
              }
            }
          }
          // Paste attempts exhausted; listener path still active.
        })();
      }
    });

    const timer = setTimeout(() => {
      server.close();
      settle(() => reject(new Error('Login timed out waiting for callback')));
    }, timeout);
  });
}

const OOB_CALLBACK_PATH = '/oauth/code/callback';
const MAX_PASTE_ATTEMPTS = 3;

/**
 * Extract a usable authorization code from whatever the user pastes.
 * Accepts:
 *   - bare code:                   `ABCD-EFGH`
 *   - full callback URL:           `http://127.0.0.1:54321/callback?code=ABCD&state=...`
 *   - query string fragment:       `?code=ABCD&state=...`  or  `code=ABCD&state=...`
 *
 * Returns null when no code can be extracted (user typed garbage or
 * pressed enter on an empty line). Preserves `-` and `_` in bare codes
 * since both are valid base64url chars and appear in real codes
 * (~50% of 22-char codes contain at least one).
 */
function extractCodeFromInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Full URL with ?code=
  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get('code');
    if (code) return code;
  } catch {
    // not a URL, fall through
  }
  // Query string only (with or without leading `?`)
  if (trimmed.includes('=')) {
    const params = new URLSearchParams(
      trimmed.startsWith('?') ? trimmed.slice(1) : trimmed
    );
    const code = params.get('code');
    if (code) return code;
  }
  // Bare code: strip whitespace only (preserve `-` and `_`).
  const code = trimmed.replace(/\s+/g, '');
  return code || null;
}

/**
 * Derive the OOB display page URL from the authorize URL. The frontend
 * validates redirect_uri against `${window.location.origin}/oauth/code/callback`,
 * and the gateway's allowlist is per-env, so the OOB URL MUST share its
 * origin with the authorize URL. Falls back gracefully on malformed input.
 */
function deriveOobRedirectUrl(authUrl: string): string {
  try {
    return new URL(authUrl).origin + OOB_CALLBACK_PATH;
  } catch {
    // authUrl is malformed; let the downstream fetch fail with a real
    // error rather than synthesizing a fake one here.
    return authUrl.replace(/\/+$/, '') + OOB_CALLBACK_PATH;
  }
}

function defaultReadline(prompt?: string): Promise<string> {
  return new Promise<string>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: false,
    });
    if (prompt) {
      process.stderr.write(prompt);
    }
    rl.once('line', (line: string) => {
      rl.close();
      resolve(line);
    });
  });
}

function defaultNoBrowserDeps(): AuthLoginNoBrowserDeps {
  return {
    generateState,
    generateCodeVerifier,
    writeConfigDeps: {
      env: process.env as Record<string, string | undefined>,
      homedir: () => os.homedir(),
      mkdir: (path: string, options: { recursive: boolean }) =>
        fsPromises.mkdir(path, options).then(() => undefined),
      writeFile: (path: string, data: string, options: { mode: number }) =>
        fsPromises.writeFile(path, data, options).then(() => undefined),
      readFile: (path: string) => fsPromises.readFile(path, 'utf-8'),
    },
    log: (msg: string) => process.stderr.write(msg),
    fetch: ((url: string, init?: RequestInit) =>
      (globalThis.fetch as unknown as FetchLike)(
        url,
        init as Parameters<FetchLike>[1]
      )) as FetchLike,
    readline: defaultReadline,
    // oobRedirectUrl deliberately left undefined — derived from --auth-url
    // at call time so it tracks prd / stg / local-dev automatically.
  };
}

/**
 * Mode B (`--no-browser`) login flow. Prints the authorize URL to stderr,
 * asks the user to paste the `code` shown on the out-of-band callback
 * page, then exchanges it for an API key via `/oauth/token`.
 *
 * Up to 3 paste attempts are allowed: on `invalid_grant` (most likely a
 * mistyped/expired code) the user is re-prompted. Any non-invalid_grant
 * error (network failure, 5xx, missing api_key, etc.) is surfaced
 * immediately without retry.
 */
export async function handleAuthLoginNoBrowser(
  args: string[],
  deps?: Partial<AuthLoginNoBrowserDeps>
): Promise<AuthLoginResult> {
  const d = { ...defaultNoBrowserDeps(), ...deps };
  const flags = parseFlags(args.slice(1));
  const profileName = flags.profile || 'default';
  const authUrl = flags['auth-url'] || DEFAULT_AUTH_URL;
  const baseUrl = flags['base-url'] || DEFAULT_BASE_URL;
  // Explicit dep wins (tests); otherwise derive from the resolved authUrl
  // so --auth-url stg/local-dev points at the matching OOB page.
  const oobRedirectUrl = d.oobRedirectUrl || deriveOobRedirectUrl(authUrl);

  const state = d.generateState();
  const codeVerifier = d.generateCodeVerifier();
  const codeChallenge = deriveChallenge(codeVerifier);

  const loginUrl = buildAuthorizeUrl({
    authUrl,
    redirectUri: oobRedirectUrl,
    state,
    codeChallenge,
  });

  d.log(
    [
      '',
      'Open this URL in any browser to log in:',
      '',
      `  ${loginUrl}`,
      '',
      'After approving, paste the code shown on the page:',
      '',
    ].join('\n')
  );

  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_PASTE_ATTEMPTS; attempt++) {
    const raw = await d.readline('> ');
    // extractCodeFromInput handles: bare code, ?code=... fragment, or
    // a full callback URL — so the user can paste whatever they
    // happened to copy. Dashes and underscores are preserved as valid
    // base64url characters.
    const code = extractCodeFromInput(raw);

    if (!code) {
      lastErr = new Error('No code entered');
      if (attempt < MAX_PASTE_ATTEMPTS) {
        d.log("That code didn't work. Try again.\n");
      }
      continue;
    }

    try {
      const apiKey = await exchangeCodeForApiKey({
        baseUrl,
        code,
        codeVerifier,
        redirectUri: oobRedirectUrl,
        fetch: d.fetch,
      });
      await writeConfig({ apiKey }, d.writeConfigDeps, profileName);
      return { status: 'logged_in', apiKey, profile: profileName };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Only retry on invalid_grant — other failures (network, 5xx, etc.)
      // surface immediately so the user isn't stuck retyping a code that
      // can never succeed.
      if (!/invalid_grant/i.test(msg)) {
        throw err instanceof Error ? err : new Error(msg);
      }
      lastErr = err instanceof Error ? err : new Error(msg);
      if (attempt < MAX_PASTE_ATTEMPTS) {
        d.log("That code didn't work. Try again.\n");
      }
    }
  }

  throw new Error(
    `Login failed after ${MAX_PASTE_ATTEMPTS} attempts (${lastErr?.message ?? 'unknown error'}). Run \`alva auth login\` to start over.`
  );
}
