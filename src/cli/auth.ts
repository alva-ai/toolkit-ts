import * as crypto from 'node:crypto';
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
  log: (msg: string) => void;
  fetch: FetchLike;
  // Readline used to accept the pasted code shown on the OOB display
  // page. Mode A delegates the paste loop to handleAuthLoginNoBrowser
  // after firing openBrowser, so this is required there too.
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

/**
 * Mode A: OOB paste flow + best-effort browser auto-open.
 *
 * Mirrors Claude's `claude` CLI design: print an authorize URL whose
 * redirect_uri is the public alva.ai/oauth/code/callback display page,
 * so following the link in ANY browser (local or remote) ends at a
 * page that shows the code in big monospace. User copies, pastes into
 * the CLI, exchange + writeConfig + return.
 *
 * The localhost listener was removed in favor of OOB because the two
 * paths require different redirect_uri values and a single code can
 * only be bound to one. OOB gives a consistent "URL ends at code"
 * experience regardless of where the user opens the URL — at the cost
 * of one extra paste step in the local-browser case.
 *
 * The only thing that distinguishes Mode A from Mode B is that
 * Mode A also fires `openBrowser` as a convenience. The flow itself
 * is delegated to `handleAuthLoginNoBrowser`.
 */
export async function handleAuthLogin(
  args: string[],
  deps?: Partial<AuthLoginDeps>
): Promise<AuthLoginResult> {
  const d = { ...defaultDeps(), ...deps };
  const flags = parseFlags(args.slice(1));
  const authUrl = flags['auth-url'] || DEFAULT_AUTH_URL;
  const oobRedirectUrl = deriveOobRedirectUrl(authUrl);

  // Best-effort browser open. We build the URL identically to Mode B
  // (same authUrl, same OOB redirect_uri) so opening it locally takes
  // the user to the same consent flow that ends at the OOB display
  // page. We pre-compute PKCE params here purely for openBrowser; the
  // delegated Mode B call generates its own set, but openBrowser only
  // needs *some* URL to open — the eventual exchange uses Mode B's
  // verifier. To keep both halves consistent we share state +
  // verifier via deps overrides.
  const state = d.generateState();
  const codeVerifier = d.generateCodeVerifier();
  const codeChallenge = deriveChallenge(codeVerifier);
  const loginUrl = buildAuthorizeUrl({
    authUrl,
    redirectUri: oobRedirectUrl,
    state,
    codeChallenge,
  });
  d.openBrowser(loginUrl).catch(() => {
    // Swallow open errors — the URL is also printed for the user.
  });

  // Delegate to the OOB paste flow. Pass our pre-built state/verifier
  // through dep overrides so the printed authorize URL in the inner
  // call matches the one we just handed to openBrowser.
  return handleAuthLoginNoBrowser(args, {
    ...deps,
    generateState: () => state,
    generateCodeVerifier: () => codeVerifier,
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
