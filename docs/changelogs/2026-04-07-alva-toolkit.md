# feat: add Alva REST API SDK and CLI as standalone open-source package

## 1. Background

The Alva REST API SDK and CLI currently live inside `backtest-js` — a private
repo that bundles them with unrelated backtesting/indicator code. Users who want
to interact with the Alva API must either use `curl` with manual env vars or
install the entire `indicatorts` package. Neither is acceptable for external
developers or agents.

**Goal:** Extract the SDK and CLI into `@alva-ai/toolkit`, a standalone
open-source (MIT) TypeScript package published to npm, shipping two artifacts:

1. **CLI tool** — installable via `npm i -g @alva-ai/toolkit`, provides `alva`
   binary with non-interactive `alva configure --api-key <key>` for
   agent-friendly setup, plus all existing subcommands (fs, run, deploy,
   release, secrets, sdk, comments, remix, screenshot, user).

2. **Browser SDK** — a single IIFE JS file importable via `<script>` tag in
   plain HTML pages, exposing `AlvaToolkit.AlvaClient` for building web
   dashboards without a build system.

**Relevant systems:**

- `code/backend/jagent/backtest-js/src/sdk/` — existing SDK source (10 resource
  classes, client, error, types)
- `code/backend/jagent/backtest-js/src/sdk/cli/` — existing CLI source
  (dispatch, config)
- `code/public/skills/skills/alva/` — API documentation and endpoint reference
- Alva REST API at `https://api-llm.prd.alva.ai`

**Constraints:**

- Must be MIT-licensed open source
- Must use state-of-the-art TypeScript tooling (tsup, Vitest, ESLint flat
  config, Prettier)
- CLI must be non-interactive (flag-based) for agent compatibility
- Browser bundle must work in plain HTML without a build system
- Package must work in both Node.js (>=18) and browser environments
- CI must enforce lint, format, test, and build checks

## 2. End-to-End Behavior

### Primary behavior

A developer installs `@alva-ai/toolkit` and can immediately interact with the
Alva API in two ways:

**CLI path:** `npm i -g @alva-ai/toolkit` installs the `alva` binary. User runs
`alva configure --api-key alva_xxx` to persist credentials to
`~/.config/alva/config.json`. Subsequent commands (`alva fs readdir --path /`,
`alva deploy list`, etc.) use the stored config automatically. All output is
JSON to stdout for machine consumption.

**Browser SDK path:** Developer adds
`<script src="https://unpkg.com/@alva-ai/toolkit/dist/browser.global.js">`
to their HTML. They call `new AlvaToolkit.AlvaClient({ apiKey: 'alva_xxx' })`
and use the same resource API (`client.fs.readdir(...)`,
`client.deploy.list()`, etc.) with promises.

### Variants

- **Config resolution order:** `--api-key` flag > `ALVA_API_KEY` env var >
  `~/.config/alva/config.json` > error
- **Base URL override:** `--base-url` flag > `ALVA_ENDPOINT` env var > config
  file > default (`https://api-llm.prd.alva.ai`)
- **`alva configure`:** Writes/overwrites `~/.config/alva/config.json` with
  provided `--api-key` and optional `--base-url`. Creates parent directories if
  needed. Prints confirmation JSON.
- **Browser SDK:** No config file support (no filesystem in browser). API key
  must be passed to constructor. Config module is tree-shaken from browser
  bundle.
- **Programmatic Node.js usage:** `import { AlvaClient } from '@alva-ai/toolkit'`
  works in ESM and CJS. Requires explicit `apiKey` in constructor — no
  automatic config file reading. Config file resolution is CLI-only behavior.

### Failure modes

- **Missing API key:** CLI prints JSON error to stderr with code
  `UNAUTHENTICATED`, exits 1. SDK throws `AlvaError` with same code.
- **Invalid API key:** Server returns 401, SDK throws `AlvaError` with code
  `UNAUTHENTICATED` and server message.
- **Network error:** SDK throws `AlvaError` with code `NETWORK_ERROR`.
- **Malformed config file:** CLI prints JSON error to stderr, exits 1.
- **`alva configure` with missing `--api-key`:** Prints usage hint to stderr,
  exits 1.
- **Unknown CLI subcommand:** Prints usage hint to stderr, exits 1.
- **`alva configure` disk write failure:** If `~/.config/alva/` cannot be
  created (permissions, read-only FS), prints JSON error to stderr, exits 1.
- **Server 5xx / non-JSON responses:** SDK catches non-ok status, reads body
  as text, attempts JSON parse for error envelope. Falls back to generic
  `AlvaError` with HTTP status code and raw text message.
- **Browser CORS:** The Alva API must send appropriate CORS headers
  (`Access-Control-Allow-Origin`) for the browser SDK to work from arbitrary
  origins. If CORS is not configured, browser `fetch` will fail with an opaque
  network error. This is a server-side requirement, not something the SDK can
  fix. Document this prerequisite clearly.

## 3. Findings

### Existing code patterns

The SDK in `backtest-js/src/sdk/` is self-contained and well-structured:

- **`client.ts`** (167 lines): `AlvaClient` class with lazy-loaded resource
  accessors, central `_request()` method handling auth headers
  (`X-Alva-Api-Key`), content negotiation (JSON vs octet-stream), error
  parsing, and binary response detection.
- **`types.ts`** (288 lines): Complete TypeScript interfaces for all API
  request/response types across 10 resource domains.
- **`error.ts`**: `AlvaError` extends `Error` with `code` and `status` fields.
- **10 resource classes** in `resources/`: user, fs (13 methods), run, deploy
  (7 methods), release (3 methods), secrets (5 methods), sdkDocs, comments,
  remix, screenshot. Each receives `AlvaClient` as dependency.
- **CLI dispatch** (`cli/index.ts`, 365 lines): Manual flag parsing, switch-
  based command routing, JSON-only output. No external CLI framework dependency.
- **Config** (`cli/config.ts`, 58 lines): Dependency-injected `loadConfig()`
  for testability, XDG-compliant config path.
- **82 tests** across client, resources, CLI dispatch, and config loading.
  All use Jest with mocked `fetch`.
- The existing CLI has **no `configure` command** — users must manually create
  the config file. This is the primary new functionality to add.

### Constraints and dependencies

- Zero runtime dependencies beyond native `fetch` (Node 18+ built-in).
- `luxon` dependency in backtest-js is NOT used by the SDK — it's for the
  indicator/backtest code. The SDK is dependency-free.
- Tests mock `global.fetch` — Vitest supports this identically to Jest.
- The `isDirectRun` check in CLI entry point uses `process.argv[1]` pattern
  (fixed in commit #257) — works in ESM.

### Chosen approach and key decisions

**Approach A (Minimal-Viable):** Copy `src/sdk/` source as-is into the new
project. Wrap with modern tooling:

- **Build:** tsup with three targets — ESM (`dist/index.js`), CJS
  (`dist/index.cjs`), IIFE browser (`dist/browser.global.js`)
- **Test:** Vitest (native ESM, faster than Jest, compatible API)
- **Lint:** ESLint v9 flat config + typescript-eslint v8
- **Format:** Prettier (match existing config)
- **CI:** GitHub Actions — lint, format check, test, build

**New code:** Only `alva configure` command and project scaffolding. All SDK
and existing CLI code copied directly.

**Rejected alternatives:**

- **Approach B (Ideal-Architecture):** Same as A, but restructure CLI dispatch
  from a single 381-line switch statement into separate command files
  (`commands/fs.ts`, `commands/deploy.ts`, etc.). Rejected: premature at current
  scale, adds rewrite risk for no immediate benefit.
- **Approach C (Lateral):** Ship browser SDK as CDN-only artifact separate from
  the npm package. Rejected: artificial separation — bundlers handle
  Node/browser split via the `exports` field, and npm publishes to unpkg/
  jsdelivr automatically.

### Risks and unknowns

- **npm org `@alva-ai`:** Must verify the npm org exists and the user has
  publish access. If not, initial publish will fail.
- **CDN availability:** IIFE bundle will be available on unpkg/jsdelivr
  automatically once published to npm. No additional setup needed.
- **fetch polyfill:** Node 18+ has native fetch. Older Node versions are not
  supported. Browser support is universal.
- **Config file permissions:** `~/.config/alva/config.json` stores API key in
  plaintext. `alva configure` should set file permissions to `0600` (owner
  read/write only) on Unix. On Windows, default ACLs are acceptable.
- **CORS:** Browser SDK requires the Alva API to serve CORS headers. If this is
  not already configured server-side, browser usage will silently fail. Must
  verify and document.
- **Import paths:** Existing source uses relative imports (`'../client'`). tsup
  bundles everything, so import paths are irrelevant in the output — no
  adjustment needed.

## 4. Change Specification

### Affected modules

All files are new. The project is built from scratch with SDK source copied
from `backtest-js/src/sdk/`.

**Project scaffolding (new):**

- `package.json` — `@alva-ai/toolkit`, type=module, exports (ESM/CJS/browser),
  bin: `alva` → `dist/cli.js`, engines: node >=18
- `tsconfig.json` — target ES2022, module NodeNext, strict, declaration
- `tsup.config.ts` — three build targets:
  1. SDK: `src/index.ts` → ESM (`dist/index.js`) + CJS (`dist/index.cjs`) + DTS
  2. CLI: `src/cli/index.ts` → ESM (`dist/cli.js`) with `#!/usr/bin/env node` banner
  3. Browser: `src/browser.ts` → IIFE (`dist/browser.global.js`), globalName
     `AlvaToolkit`, platform browser, minified
- `vitest.config.ts` — test root `test/`, coverage via v8
- `eslint.config.ts` — ESLint v9 flat config, typescript-eslint v8
  `recommendedTypeChecked`, prettier compat
- `.prettierrc.json` — singleQuote: true, trailingComma: es5 (match existing)
- `.github/workflows/ci.yml` — Node 18+20, lint, prettier check, test, build
- `LICENSE` — MIT, copyright Alva AI
- `README.md` — Installation, CLI usage, SDK usage, browser usage, API ref

**SDK source (copied from backtest-js):**

- `src/index.ts` — re-exports AlvaClient, AlvaError, all types
- `src/browser.ts` — re-exports from index (IIFE entry point)
- `src/client.ts` — AlvaClient class (no changes)
- `src/error.ts` — AlvaError class (no changes)
- `src/types.ts` — all interfaces (no changes)
- `src/resources/*.ts` — 10 resource classes (no changes)

**CLI source (copied + modified):**

- `src/cli/index.ts` — add `configure` command to dispatch switch. Add `help`
  output for `alva` with no args and `alva --help`.
- `src/cli/config.ts` — add `writeConfig(config, deps?)` function:
  - Accepts `{ apiKey: string, baseUrl?: string }`
  - Writes JSON to `~/.config/alva/config.json`
  - Creates parent directories with `fs.mkdir(recursive: true)`
  - Sets file permissions to 0o600 on Unix
  - Dependency-injected for testability (writeFile, mkdir, homedir)

**Test files (copied + adapted):**

- All test files moved from co-located to `test/` directory
- Jest → Vitest: `jest.fn()` → `vi.fn()`, `jest.mock()` → `vi.mock()`,
  imports from `vitest`
- New tests for `configure` command and `writeConfig` function

### API changes

No server-side API changes. This is a client-side package only.

The npm package exposes:

```
exports:
  ".":
    import: ./dist/index.js (types: ./dist/index.d.ts)
    require: ./dist/index.cjs (types: ./dist/index.d.cts)
  "./browser": ./dist/browser.global.js
bin:
  alva: ./dist/cli.js
```

### Database impact

None.

### Configuration changes

New CLI command `alva configure`:

```
alva configure --api-key <key> [--base-url <url>]
```

Writes to `~/.config/alva/config.json`:

```json
{ "apiKey": "alva_xxx", "baseUrl": "https://api-llm.prd.alva.ai" }
```

File permissions: 0o600 on Unix.

### Error path analysis

```
METHOD/CODEPATH           | WHAT CAN GO WRONG          | HANDLING                    | USER SEES
--------------------------|----------------------------|-----------------------------|---------------------------
writeConfig()             | Dir creation fails         | Throw, CLI catches          | JSON error to stderr, exit 1
                          | File write fails           | Throw, CLI catches          | JSON error to stderr, exit 1
                          | chmod fails (Windows)      | Catch and ignore silently   | Config written without perms
configure dispatch        | Missing --api-key flag     | Print usage to stderr       | Usage hint, exit 1
AlvaClient._request()     | Network error (fetch fail) | Wrap in AlvaError           | NETWORK_ERROR code
                          | HTTP 4xx/5xx               | Parse error envelope        | AlvaError with code+message
                          | Non-JSON error response    | Fallback to status+text     | AlvaError with raw message
loadConfig()              | Malformed config JSON      | Throw SyntaxError           | JSON error to stderr, exit 1
                          | Config file not found      | Return empty config         | Proceeds without file config
main() entry              | No API key anywhere        | AlvaError UNAUTHENTICATED   | JSON error to stderr, exit 1
                          | Unknown command            | Print usage to stderr       | Usage hint, exit 1
```

No critical gaps — all error paths have handling.

### Backward compatibility

Not applicable — this is a new package with no prior versions.

## 5. Testability Design & Test Plan

### Testability design

**Module boundaries:**

- `AlvaClient` is the primary seam — all resource classes depend on it via
  constructor injection. Tests mock `client._request()` to verify resource
  methods call the right endpoints.
- `loadConfig` and `writeConfig` use dependency injection (fs functions,
  homedir, argv, env) — tests provide mock implementations.
- CLI `dispatch()` is a pure function taking `(client, args)` — tests provide
  a mocked client.
- `main()` is the integration point (loads config, creates client, dispatches).
  Tested indirectly via CLI dispatch tests.

**Isolation strategy:**

- Each resource class tested independently by mocking `client._request()`
- Client tested by mocking `global.fetch`
- Config tested with injected mock dependencies
- CLI dispatch tested with mocked client methods

**Dependencies to mock:**

- `global.fetch` — for client.test.ts
- `client._request()` — for all resource tests
- `fs.readFile`, `fs.writeFile`, `fs.mkdir`, `os.homedir` — for config tests
- `process.argv`, `process.env` — for config tests

**Side-effect boundaries:**

- `fetch()` calls — only in `AlvaClient._request()`
- Filesystem I/O — only in `loadConfig()` and `writeConfig()`
- `process.exit()` — only in `main()`
- `console.log/error` — only in `main()`

### Code path coverage

```
CODE PATH COVERAGE
===========================
[+] src/client.ts — AlvaClient
    |
    +-- constructor()
    |   +-- [EXIST] Default base URL                    — client.test.ts
    |   +-- [EXIST] Custom base URL                     — client.test.ts
    |   +-- [EXIST] API key storage                     — client.test.ts
    |
    +-- _request()
    |   +-- [EXIST] GET with query params               — client.test.ts
    |   +-- [EXIST] POST with JSON body                 — client.test.ts
    |   +-- [EXIST] POST with raw body                  — client.test.ts
    |   +-- [EXIST] Auth header injection               — client.test.ts
    |   +-- [EXIST] Binary response handling            — client.test.ts
    |   +-- [EXIST] Error envelope parsing              — client.test.ts
    |   +-- [EXIST] Network error wrapping              — client.test.ts
    |   +-- [EXIST] Non-JSON error response             — client.test.ts
    |
    +-- _requireAuth()
        +-- [EXIST] Throws when no API key              — client.test.ts
        +-- [EXIST] Passes when API key present         — client.test.ts

[+] src/error.ts — AlvaError
    +-- [EXIST] Error properties                        — client.test.ts
    +-- [EXIST] instanceof check                        — client.test.ts

[+] src/resources/*.ts — All 10 resource classes
    +-- [EXIST] 43 methods across 10 classes            — resource tests
    (All existing tests cover happy path request verification)

[+] src/cli/config.ts — loadConfig + writeConfig
    |
    +-- loadConfig()
    |   +-- [EXIST] Flag > env > file priority          — config.test.ts
    |   +-- [EXIST] XDG config path                     — config.test.ts
    |   +-- [EXIST] Missing file fallback               — config.test.ts
    |   +-- [EXIST] Malformed JSON                      — config.test.ts
    |   +-- [EXIST] Base URL resolution                 — config.test.ts
    |
    +-- writeConfig()
        +-- [PLAN] Happy path: writes config file       — config.test.ts
        +-- [PLAN] Creates parent directories           — config.test.ts
        +-- [PLAN] Sets file permissions to 0o600       — config.test.ts
        +-- [PLAN] Merges with existing config          — config.test.ts
        +-- [PLAN] Handles mkdir failure                — config.test.ts
        +-- [PLAN] Handles writeFile failure            — config.test.ts

[+] src/cli/index.ts — dispatch + configure
    |
    +-- dispatch()
    |   +-- [EXIST] Routes to all command groups        — cli.test.ts
    |   +-- [EXIST] Flag parsing                        — cli.test.ts
    |   +-- [EXIST] Unknown command handling            — cli.test.ts
    |
    +-- configure command
        +-- [PLAN] Writes config with --api-key         — cli.test.ts
        +-- [PLAN] Writes config with --api-key + --base-url — cli.test.ts
        +-- [PLAN] Error on missing --api-key           — cli.test.ts

[+] src/browser.ts — Browser entry point
    +-- [PLAN] Exports AlvaClient                       — build verification
    +-- [PLAN] Exports AlvaError                        — build verification
    +-- [PLAN] No Node.js imports                       — build verification
```

Zero gaps. All paths have planned or existing tests.

### Unit tests

**Existing tests (copied, Jest→Vitest adaptation):**

| Test file                   | Cases | Adaptation needed                              |
| --------------------------- | ----- | ---------------------------------------------- |
| client.test.ts              | 26    | `jest.fn()` → `vi.fn()`, imports from `vitest` |
| cli.test.ts                 | 8     | Same adaptation                                |
| config.test.ts              | 9     | Same adaptation                                |
| resources/fs.test.ts        | 16    | Same adaptation                                |
| resources/deploy.test.ts    | 9     | Same adaptation                                |
| resources/secrets.test.ts   | 5     | Same adaptation                                |
| resources/resources.test.ts | 12    | Same adaptation                                |

**New tests:**

| Test case                           | Input                                                | Expected behavior                                                   |
| ----------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| writeConfig happy path              | `{ apiKey: 'test_key' }`                             | Writes JSON to config path, calls mkdir, calls writeFile with 0o600 |
| writeConfig with baseUrl            | `{ apiKey: 'k', baseUrl: 'http://x' }`               | JSON includes both fields                                           |
| writeConfig creates dirs            | Fresh homedir                                        | mkdir called with `{ recursive: true }`                             |
| writeConfig sets permissions        | Unix                                                 | writeFile called with `{ mode: 0o600 }`                             |
| writeConfig merges existing         | Existing config has baseUrl                          | New apiKey merged, baseUrl preserved                                |
| writeConfig mkdir failure           | mkdir throws EACCES                                  | Error propagates                                                    |
| writeConfig write failure           | writeFile throws ENOSPC                              | Error propagates                                                    |
| configure with --api-key            | `['configure', '--api-key', 'k']`                    | Calls writeConfig, returns confirmation                             |
| configure with --api-key --base-url | `['configure', '--api-key', 'k', '--base-url', 'u']` | Calls writeConfig with both                                         |
| configure missing --api-key         | `['configure']`                                      | Throws error with usage hint                                        |

### Integration / E2E tests

Not applicable for this package. The SDK calls an external API — integration
tests would require a live API key and are out of scope for CI. The existing
unit tests with mocked `fetch` provide sufficient coverage.

### Build verification tests

Verified manually and by CI:

- `npm run build` produces `dist/index.js`, `dist/index.cjs`, `dist/cli.js`,
  `dist/browser.global.js`
- CLI binary is executable: `node dist/cli.js --help`
- Browser bundle defines `AlvaToolkit` global with `AlvaClient` constructor
- TypeScript declarations are generated at `dist/index.d.ts`

## 6. Human Interaction

### Initial thoughts

User wants to build a new module under `code/public/toolkit-ts` with two
purposes: (1) a CLI tool like gcloud for interacting with Alva API with managed
config/auth, and (2) a JS SDK importable from plain HTML pages. Must be
open-source (MIT) with state-of-the-art TypeScript tooling, CI, and good OSS
practices.

### Iteration feedback

- Package name: `@alva-ai/toolkit` (scoped)
- CLI setup must be non-interactive (flags only) for agent compatibility —
  `alva configure --api-key <key>`
- Copy existing code from backtest-js rather than rewriting
- Approach A (minimal-viable) selected

### Agent responses

- Confirmed SDK source is self-contained and dependency-free — safe to copy
- Recommended modern tooling (tsup, Vitest, ESLint flat config) over
  backtest-js's legacy setup (raw esbuild, Jest, eslintrc)
- IIFE over UMD for browser bundle (UMD is dead)
- Single package over split SDK/CLI packages

## 7. Outcome

### Changes made

**Project scaffolding (new):**

- `package.json` — `@alva-ai/toolkit` v0.1.0, type=module, exports (ESM/CJS/browser), bin, engines >=18
- `tsconfig.json` — ES2022/NodeNext, strict, declaration
- `tsup.config.ts` — 3 build targets (ESM+CJS+DTS, CLI+shebang, browser IIFE)
- `vitest.config.ts` — test root, v8 coverage
- `eslint.config.ts` — ESLint v9 flat config, typescript-eslint recommended, prettier
- `.prettierrc.json` — singleQuote, es5 trailing commas
- `.prettierignore`, `.gitignore`

**OSS files:**

- `LICENSE` — MIT, 2026 Alva AI
- `README.md` — Install, CLI Quick Start, SDK Usage, Browser Usage, API Reference, Contributing

**SDK source (copied from backtest-js, import paths updated to `.js` extensions):**

- `src/index.ts` — barrel re-export of AlvaClient, AlvaError, all types
- `src/browser.ts` — re-export from index (IIFE entry)
- `src/client.ts` — AlvaClient class with lazy resource accessors, \_request(), \_requireAuth()
- `src/error.ts` — AlvaError class
- `src/types.ts` — 44 TypeScript interfaces for all API domains
- `src/resources/user.ts` — UserResource (me)
- `src/resources/fs.ts` — FsResource (14 methods)
- `src/resources/run.ts` — RunResource (execute)
- `src/resources/deploy.ts` — DeployResource (7 methods)
- `src/resources/release.ts` — ReleaseResource (3 methods)
- `src/resources/secrets.ts` — SecretsResource (5 methods)
- `src/resources/sdkDocs.ts` — SdkDocsResource (3 methods)
- `src/resources/comments.ts` — CommentsResource (3 methods)
- `src/resources/remix.ts` — RemixResource (save)
- `src/resources/screenshot.ts` — ScreenshotResource (capture)

**CLI source (copied + new features):**

- `src/cli/config.ts` — loadConfig() (copied) + writeConfig() (new: DI-based, mkdir, merge, chmod 0o600)
- `src/cli/index.ts` — dispatch() (copied) + handleConfigure() (new) + HELP_TEXT (new) + help/no-args handling

**Test files (Jest → Vitest migration + new tests):**

- `test/client.test.ts` — 20 tests (AlvaClient constructor, \_request, \_requireAuth, AlvaError)
- `test/resources/fs.test.ts` — 20 tests (all FsResource methods)
- `test/resources/deploy.test.ts` — 8 tests (all DeployResource methods)
- `test/resources/secrets.test.ts` — 5 tests (all SecretsResource methods)
- `test/resources/resources.test.ts` — 14 tests (User, Run, Release, SdkDocs, Comments, Remix, Screenshot)
- `test/cli.test.ts` — 12 tests (dispatch routing + handleConfigure + help text)
- `test/config.test.ts` — 16 tests (loadConfig priority + writeConfig happy/error/merge paths)

**CI:**

- `.github/workflows/ci.yml` — Node 18/20/22 matrix, lint, format, typecheck, test, build

### Tests added

**Existing tests (82 → adapted from Jest to Vitest):**

All 82 original tests from backtest-js ported with `jest.fn()` → `vi.fn()`, `jest.Mock` → `ReturnType<typeof vi.fn>`, `fail()` → `expect.fail()`.

**New tests (13):**

| Test case                                   | File           | Verifies                                                    |
| ------------------------------------------- | -------------- | ----------------------------------------------------------- |
| writeConfig happy path                      | config.test.ts | Writes JSON with apiKey, calls writeFile with mode 0o600    |
| writeConfig with baseUrl                    | config.test.ts | JSON includes both apiKey and baseUrl                       |
| writeConfig creates dirs                    | config.test.ts | mkdir called with { recursive: true }                       |
| writeConfig sets permissions                | config.test.ts | writeFile called with { mode: 0o600 }                       |
| writeConfig merges existing                 | config.test.ts | New apiKey merged, existing baseUrl preserved               |
| writeConfig mkdir failure                   | config.test.ts | EACCES error propagates                                     |
| writeConfig writeFile failure               | config.test.ts | ENOSPC error propagates                                     |
| writeConfig respects XDG_CONFIG_HOME        | config.test.ts | Uses custom XDG path for mkdir and writeFile                |
| handleConfigure with --api-key              | cli.test.ts    | Calls writeConfig, returns { status: 'configured', apiKey } |
| handleConfigure with --api-key + --base-url | cli.test.ts    | Returns both apiKey and baseUrl in result                   |
| handleConfigure missing --api-key           | cli.test.ts    | Throws error with usage hint                                |
| dispatch help text (no args)                | cli.test.ts    | Throws with Usage: alva message                             |
| dispatch help text (--help)                 | cli.test.ts    | Throws with Usage: alva message                             |

**Coverage cross-reference:** All `[PLAN]` entries from section 5 coverage diagram are implemented. Zero gaps.

### Migration

Not applicable — no database changes.

### Build outputs

| Artifact               | Size    | Format |
| ---------------------- | ------- | ------ |
| dist/index.js          | 12.9 KB | ESM    |
| dist/index.cjs         | 13.9 KB | CJS    |
| dist/index.d.ts        | 10.2 KB | DTS    |
| dist/index.d.cts       | 10.2 KB | DTS    |
| dist/cli.js            | 26.8 KB | ESM    |
| dist/browser.global.js | 8.3 KB  | IIFE   |

## 8. Remaining Tasks

- **npm org `@alva-ai`:** Must verify the npm org exists and user has publish access before first `npm publish`.
- **CORS verification:** Browser SDK requires the Alva API to serve CORS headers. Must verify server-side CORS is configured before documenting browser usage as production-ready.
- **npx support:** Test `npx @alva-ai/toolkit configure --api-key <key>` works after publishing.
- ~~**`alva configure` validation:**~~ Done — warns when API key doesn't start with `alva_`.
- ~~**CLI required-flag validation:**~~ Done — all required flags validated with clear error messages.
- ~~**Boolean flag toggle:**~~ Done — `--no-push-notify` and `--no-recursive` supported via `--no-<flag>` syntax.
- ~~**CLI test coverage:**~~ Done — added tests for `release`, `sdk`, `comments`, `remix`, `--no-push-notify`, and required-flag validation (103 total tests).
