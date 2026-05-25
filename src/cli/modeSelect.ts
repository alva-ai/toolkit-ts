export type AuthMode = 'browser' | 'no-browser';

export interface ModeSelectFlags {
  browser?: boolean;
  noBrowser?: boolean;
}

/**
 * Decide whether to use the browser-based or no-browser PKCE login flow.
 *
 * Pure function — does not touch `process` directly; the caller wires in
 * `process.env` and `process.platform`.
 *
 * Decision order:
 *   1. Explicit `--no-browser` wins.
 *   2. Explicit `--browser` wins.
 *   3. Linux without DISPLAY and without WAYLAND_DISPLAY → no-browser.
 *   4. SSH_CONNECTION set and no DISPLAY → no-browser.
 *   5. CONTAINER or DEVCONTAINER env set → no-browser.
 *   6. Default → browser.
 */
export function selectMode(
  env: Record<string, string | undefined>,
  flags: ModeSelectFlags,
  platform: NodeJS.Platform
): AuthMode {
  if (flags.noBrowser === true) return 'no-browser';
  if (flags.browser === true) return 'browser';

  if (platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY) {
    return 'no-browser';
  }

  if (env.SSH_CONNECTION && !env.DISPLAY) {
    return 'no-browser';
  }

  if (env.CONTAINER || env.DEVCONTAINER) {
    return 'no-browser';
  }

  return 'browser';
}
