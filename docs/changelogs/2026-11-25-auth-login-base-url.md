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
- D2: before printing a URL or opening a browser, login checks that it can
  write the config, and a failure stops there with the path, the reason and
  "nothing was signed in", so no key is minted. The check never changes an
  existing config: it opens it for appending and adds nothing, so a write that
  fails after the open (full disk, file-size limit) cannot truncate it. With
  no config it creates an empty one (`wx`, mode 600). A config that exists but
  cannot be read stops login the same way and is not written. Both points came
  from Codex review on the PR: the first version rewrote the file in place,
  replacing an unreadable config with an empty one and truncating on a failed
  write, each before the user had signed in.
  Tests that asserted "no config written" on a failed login now assert that no
  key was saved.

Not changed: login still ignores `ALVA_ENDPOINT` (there is no matching
variable for `--auth-url`, so honoring one without the other would mint at one
environment after signing in at another).

- D3: `auth.ts` uses the `WriteConfigDeps` of `config.ts` instead of its own
  copy, so the file-access contract the check relies on (`flag`) is stated
  once. Types cannot stop an implementation from dropping an optional `flag`,
  so a login test on the CLI's own file access pins it: a failed login leaves
  an existing config byte for byte.

Occam (final diff): nothing removed. Saving the production endpoint too is
what keeps a re-login's key and endpoint paired without changing
`writeConfig`; the check opens the file for writing because only that shows
what a sandbox allows, and appending nothing is the one open that cannot lose
data; each login mode calls it, so each has its own test.

## Rollout

Ships with the next toolkit release; no gateway or backend change.

## Verification

- `npx vitest run` (64 files, 1500 tests). New: `--base-url` is saved with
  the key and `loadConfig` for `whoami --profile <it>` then resolves that
  endpoint (the bug report's steps); a login without `--base-url` rewrites an
  STG profile to production; a config that cannot be written fails before any
  URL, prompt, browser or token request, in both modes; an unreadable config
  is neither written nor followed by a sign-in. On real files: an existing
  config keeps its bytes, a missing one is created empty with mode 600, and a
  write that fails after opening the file leaves it intact. Reverting `src`
  with the tests kept fails 7 tests; restoring the in-place rewrite fails the
  failed-write one; making the CLI's file access drop `flag` still type-checks
  but fails the default-file-access login test.
- `npx tsc --noEmit`, `npx eslint src test`, `npx prettier --check` on the
  changed files.
- Built CLI (`npm run build`, `node dist/cli.js auth login --no-browser`)
  against real permissions: a read-only config directory and a read-only
  `config.json` each exit 1 at once with `Cannot write <path> (EACCES …)`; a
  write-only `config.json` exits 1 with `Cannot read <path> (EACCES …)`; none
  prints a login URL and every existing file keeps its profiles. Under
  `ulimit -f 1` a 3,313-byte config passes the check unchanged (same hash) and
  the URL is printed. A missing config is created as `{"profiles": {}}` with
  mode 600. Signing in for real was not run (needs a person at the browser);
  the saved endpoint is covered by the tests above.

## Review

Final net diff against `main` (through D3), all six passes: behavior and
scope, code quality, tests, security/data/compatibility, operations, docs. No
open findings. Codex review found the two D2 data-loss cases in earlier
versions (both fixed above); the shared type and its pinning test came from
the final pass. E2E not required: CLI-only, no service change.

## Remaining

- Seen while verifying, not changed: `--no-browser` with stdin closed exits 0
  without saying anything, as before this change.
