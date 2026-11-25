# fix(auth): save the login's API endpoint with its key; check the config is writable first

Found by the Agent Link STG test (bug report 2026-11-25, BUG-3 and its minor
follow-up), where Claude Code and Codex each signed in with `--base-url`.

## Problem

- `alva auth login --base-url <url>` minted the key at `<url>` but saved only
  the key. The next command on that profile went to production with an STG
  key and failed with `invalid api key` (or read production data). All three
  success paths (listener, paste in browser mode, `--no-browser`) called
  `writeConfig({ apiKey })`.
- Login wrote the config only after the gateway had minted the key. Where the
  config could not be written (an agent sandbox without write access to
  `~/.config/alva`), the user had signed in for nothing and an unused key
  stayed in their key list.

## Change

- D1: login saves the endpoint it minted the key at with the key, in all
  three paths. A key is valid only there, so the two are saved together: a
  login without `--base-url` saves the production endpoint, which also points
  a profile that was on STG back at production with its new production key.
- D2: before printing a URL or opening a browser, login writes the config
  back unchanged (an empty one when there is none). A failure stops there with
  the path, the reason and "nothing was signed in", so no key is minted.
  Tests that asserted "no config written" on a failed login now assert that no
  key was saved.

Not changed: login still ignores `ALVA_ENDPOINT` (there is no matching
variable for `--auth-url`, so honoring one without the other would mint at one
environment after signing in at another).

Occam (final diff): nothing removed. Saving the production endpoint too is
what keeps a re-login's key and endpoint paired without changing
`writeConfig`; the check writes for real because only a write shows what a
sandbox allows, and keeps the file's bytes and mode; each login mode calls it,
so each has its own test.

## Rollout

Ships with the next toolkit release; no gateway or backend change.

## Verification

- `npx vitest run` (64 files, 1495 tests). New: `--base-url` is saved with
  the key and `loadConfig` for `whoami --profile <it>` then resolves that
  endpoint (the bug report's steps); a login without `--base-url` rewrites an
  STG profile to production; a config that cannot be written fails before any
  URL, prompt, browser or token request, in both modes. Reverting `src` with
  the tests kept fails 7 of them.
- `npx tsc --noEmit`, `npx eslint src test`, `npx prettier --check` on the
  changed files.
- Built CLI (`npm run build`, `node dist/cli.js auth login --no-browser`)
  against real permissions: a read-only `XDG_CONFIG_HOME` and a read-only
  `config.json` each exit 1 at once with `Cannot write <path> (EACCES …)`,
  print no login URL, and leave the file as it was; a writable legacy flat
  config is rewritten byte for byte (same hash, mode 600) and the URL is
  printed. Signing in for real was not run (needs a person at the browser);
  the saved endpoint is covered by the tests above.

## Remaining

- Seen while verifying, not changed: `--no-browser` with stdin closed exits 0
  without saying anything, as before this change.
