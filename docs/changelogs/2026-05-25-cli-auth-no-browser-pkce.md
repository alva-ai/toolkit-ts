# feat: alva auth login --no-browser via OAuth Authorization Code + PKCE

## 1. Background

CLI-side scope for the cross-service work that adds a "paste the code
from your browser" auth flow for SSH / container / headless
environments, plus upgrades the existing localhost auth flow to
standard OAuth 2.0 Authorization Code + PKCE. **See alva-gateway
changelog `code/backend/alva-gateway/docs/changelogs/2026-05-25-cli-auth-no-browser-pkce.md`
for full context, design rationale, premises, and the 19-task
implementation plan.**

In short: today `alva auth login` requires both a local browser AND
a local-listener on 127.0.0.1, which breaks for SSH / container /
headless dev environments. The bigger UX gap aside, the existing
localhost flow also passes the plaintext `api_key` through a redirect
URL query string — it lands in browser history. PKCE-ifying the
existing flow and adding a parallel `--no-browser` flow on the same
endpoints fixes both at once.

## 2. End-to-End Behavior (CLI slice)

`alva auth login` has two modes that share the same OAuth endpoints
on the gateway, differing only in `redirect_uri`:

- **Mode A (browser-on-same-machine)**: local listener on
  `127.0.0.1:<random>/callback`, browser opens authorize URL with
  PKCE challenge, callback receives `?code=...`, CLI POSTs to
  `/oauth/token` with the verifier and gets back an API key.
- **Mode B (no-browser)**: prints the authorize URL with `redirect_uri =
  https://alva.ai/oauth/code/callback` to stderr, prompts the user
  to paste the code shown on that page, then exchanges via the same
  `/oauth/token`. Up to 3 paste retries on `invalid_grant`; network
  errors fail fast.

Mode selection: `--no-browser` / `--browser` flag forces; otherwise
auto-detect (Linux+no DISPLAY, SSH_CONNECTION+no DISPLAY, CONTAINER /
DEVCONTAINER → Mode B; else Mode A).

## 3. Findings

- Reused the existing `AuthLoginDeps` dependency-injection pattern; added `fetch` (for token exchange), `generateCodeVerifier` (for PKCE), `readline` + `oobRedirectUrl` (for Mode B).
- Extracted `buildAuthorizeUrl` and `exchangeCodeForApiKey` as module-level functions so Mode A and Mode B share them without duplication.
- Per repo memory `feedback_pnpm_over_bun`: used pnpm for installs.

## 4. Change Specification (CLI slice)

See primary changelog section 4.

This repo's files:
- `src/cli/pkce.ts` (new) — `generateCodeVerifier` + `deriveChallenge`.
- `src/cli/modeSelect.ts` (new) — pure `selectMode(env, flags, platform)`.
- `src/cli/auth.ts` (modified) — refactored Mode A; added Mode B; exported shared helpers.
- `src/cli/index.ts` (modified) — `--no-browser` / `--browser` flags; updated `COMMAND_HELP.auth`.
- `test/cli/pkce.test.ts`, `test/cli/modeSelect.test.ts`, `test/cli/authLoginNoBrowser.test.ts` (new) + `test/cli/authLogin.test.ts` (rewritten from `test/auth.test.ts`).

## 7. Outcome

**Commits on `feat/cli-auth-no-browser-pkce`:**
- `fffb693` — `feat(cli): add PKCE + mode-select helpers`
- `bb5c440` — `refactor(cli): handleAuthLogin uses PKCE + /oauth/token exchange (Mode A)`
- `c45c341` — `feat(cli): add handleAuthLoginNoBrowser (Mode B)`
- `ab695a3` — `feat(cli): wire --no-browser/--browser flags for auth login`

**Tests** (all PASS): **401/401** across 33 files. New additions:
- 4 PKCE cases (incl. RFC 7636 Appendix B reference vector)
- 9 mode-select cases (Linux no-DISPLAY, SSH_CONNECTION, DEVCONTAINER, CONTAINER, WAYLAND_DISPLAY, macOS default, explicit flag overrides, verifier-uniqueness)
- 12 Mode A handleAuthLogin (rewritten contract)
- 4 Mode B handleAuthLoginNoBrowser (happy / retry / 3-exhaustion / network error)

`pnpm typecheck` + `pnpm lint`: clean.

## 8. Remaining Tasks

See primary changelog section 8. CLI-specific:

- Once the gateway PR lands and a new `@alva-ai/toolkit` version is
  cut, the legacy `/authorize` branch can be removed from the
  frontend (toolkit-ts version target: `>= 0.9.0`).
