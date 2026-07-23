# refactor(cli): name IM providers explicitly

## 1. Background

- Problem/outcome: CLI output and flags currently use `channel` for both IM
  providers such as Telegram and first-class Alva channels. Make every
  CLI-visible IM transport use `im_provider` terminology while preserving
  `channel_id` for Alva channels.
- Verified constraints: the gateway and public SDK contracts remain unchanged;
  this delivery is limited to the toolkit CLI and the Alva Skill.

## 2. End-to-End Behavior

- B1 - `alva whoami` and `alva user me` expose `active_im_provider` instead of
  the gateway's legacy `active_channel` field.
- B2 - alert and notification history filter by `--delivery-provider`, because
  the existing values include both IM providers and `web`; the CLI maps that
  value into the existing SDK request and exposes each result as
  `delivery_provider` without changing the REST contract.
- B3 - CLI help consistently distinguishes an Alva channel ID from an
  IM provider and an attached external IM group.
- B4 - the Alva Skill reads and describes the CLI's `active_im_provider` field
  and uses IM-provider terminology for external delivery.
- F1 - the removed `--channel` history flag fails with a direct instruction to
  use `--delivery-provider`, rather than being silently ignored.

## 3. Findings

- Evidence/pattern: `whoami` and `user me` currently return `client.user.me()`
  data directly, while both history commands pass `flags.channel` into the SDK.
- Chosen direction: normalize only at CLI dispatch boundaries and keep SDK
  resource types and request fields unchanged. This keeps the wrapper thin and
  avoids expanding into gateway, proto, database, or frontend contracts.
- Risks/unknowns: the CLI JSON field and history flag rename are intentionally
  breaking for scripts that consume `active_channel` or pass `--channel`.

## 4. Change Specification

- `src/cli/index.ts`: project identity responses to `active_im_provider`, parse
  `--delivery-provider` for history commands, project history results to
  `delivery_provider`, reject legacy `--channel`, and clarify Alva channel versus
  IM-provider help text.
- `test/cli.test.ts`: cover both identity commands, both history commands, the
  legacy-flag error, and public help terminology.
- `alva-ai/skills`: update `SKILL.md`, preflight, and push-notification guidance;
  bump the skill patch version.
- Contract/schema impact: CLI-only breaking rename; no SDK, REST, proto, schema,
  generated-code, or deployment changes.
- Compatibility/rollout: toolkit and Skill PRs are independent at build time but
  should merge and release together so agent instructions match CLI output.

## 5. Verification Strategy

- Affected packages/components: toolkit CLI dispatch/help/tests; Alva Skill core
  and notification/preflight references.
- Relevant dependents: Alva Skill, because it consumes CLI field and flag names.
- Focused commands: `npx vitest run test/cli.test.ts`, `npm run typecheck`,
  `npm run lint`, `npm run format:check`, `npm run build`; skill terminology
  searches, repository-provided docs validation when available, and
  `git diff --check` in both repositories.
- Escalation triggers: unexpected SDK/type changes or failures outside CLI tests.
- Full suite required: no - executable behavior is contained in CLI dispatch and
  its dedicated test file.
- E2E Required: no - the existing REST payload and SDK request contract do not
  change.

| Behavior | Evidence                                                                    |
| -------- | --------------------------------------------------------------------------- |
| B1       | identity dispatch tests assert the projected field and removed legacy field |
| B2       | history tests assert request mapping and `delivery_provider` output         |
| B3       | command-help tests assert Alva channel and IM-provider wording              |
| B4       | scoped Skill terminology search and docs validation                         |
| F1       | both history surfaces reject `--channel` with migration guidance            |

### Implementation Checklist

- [x] Add failing CLI behavior and help tests for the new terminology.
- [x] Implement identity/history projection, flag mapping, and help clarification.
- [x] Update Alva Skill terminology and patch version.
- [x] Run final scoped verification in both owner repositories.

## 6. Human Interaction

- The user explicitly limited implementation to the CLI and Alva Skill; backend,
  gateway, SDK resource, persistence, and frontend renames are excluded.

## 7. Outcome

- Result: CLI identity output now exposes `active_im_provider`; notification
  history uses `--delivery-provider` and returns `delivery_provider`; numeric
  `channel_id` help consistently identifies Alva channels.
- Changes: toolkit CLI dispatch/help/tests plus Alva Skill preflight,
  push-notification guidance, patch version, and deterministic eval coverage.
- Deviations: None.
- Verification: toolkit `npx vitest run test/cli.test.ts` (296/296),
  `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`,
  and `git diff --check`; Skill docs eval 64/64 cases and 645/645 checks,
  mutation smoke 12/12, terminology search, and `git diff --check`.
- Migration: None.

## 8. Remaining Tasks

None.
