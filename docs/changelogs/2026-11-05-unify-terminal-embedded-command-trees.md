# Proposal: one command tree for the terminal CLI and embedded dispatch

**Status: proposed. Needs owner sign-off before implementation.** It reverses
the 2026-08-14 decision ([slim-agent-cli](2026-08-14-slim-agent-cli.md), B2)
that the system `alva` CLI stays byte- and behavior-compatible while the
embedded `./dispatch` gets its own resource-oriented tree.

Trigger: [#204](https://github.com/alva-ai/toolkit-ts/pull/204). It added
seven commands under two names: `subscriptions watchlist-add` on the terminal
CLI and `markets watchlist add` on the embedded dispatch. #204 is being changed
to give each of them one path in both trees. This record covers the 41 existing
divergences.

## 1. Background and Current State

- Toolkit ships two catalogs: `src/cli/commandDefinitions.ts` (terminal, 182
  paths, 39 groups) and `src/cli/embeddedCommandDefinitions.ts` (embedded, 106
  routes + 25 actions, 18 groups). Both run the same `executeParsedCommand`
  handlers; an embedded `route(path, target)` rewrites its path to a terminal
  path before execution.
- On `origin/main`, 41 embedded routes use a different path from their terminal
  target (table in §4). #204 would add 7 more (48 total) unless changed.
- The two Skills follow different trees. The public Skill
  (`alva-ai/skills`, `skills/alva`) uses terminal names: about 50 command
  references to renamed paths (`release playbook` 11, `functions *` about
  10, `whoami` 9, `credits *` 6, `secrets *` 5, `release playbook-draft` 4,
  others 1–2). `@alva/alpi-slim-skill` (sdk-monorepo) uses embedded names. An
  agent or person who learns one tree gets `Unknown command` on the other.
- The parser (`commandParser.ts`) has no alias mechanism. Duplicate paths throw
  at build time. Unknown paths get an edit-distance suggestion only.
- `src/cli/index.ts` already writes a result `_warning` to stderr. A
  deprecation hint can use that channel without changing stdout JSON.

### Same path, different handler (collisions)

| Path                 | Terminal handler                                                                                                                                  | Embedded handler                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `trading accounts`   | `client.trading.accounts()` → Gateway `GET /api/v1/trading/accounts` (trex `ListAccounts`, enriched with Signal subscriptions and Playbook names) | `handleBroker(['accounts'])` → trex `BrokerService.Invoke` venue-native output |
| `trading risk-rules` | `client.trading.riskRules()` → Gateway `GET /api/v1/trading/risk-rules`                                                                           | `handleBroker(['risk-rules'])` → trex `BrokerService.Invoke`                   |

Both sides are trex-backed, so they most likely list the same accounts and
rules. The RPC and the response shape differ, so the same command returns
different JSON depending on the entry point. The public Skill
(`references/api/broker.md:64`) tells the Agent to take a trex account id
"from `alva trading accounts`", which works only if both shapes carry the same
id.

## 2. Problem Model and End-to-End Behavior

- B1: A capability that exists in both entries has exactly one canonical path,
  with identical flags and output, in both trees.
- B2: The canonical tree is the embedded, resource-oriented one (`account …`,
  `playbooks …`, `portfolio …`, `trading signals …`, `trading broker`).
- B3: Every terminal path that is renamed keeps working as a deprecated alias
  for at least one major version. It executes exactly as before, writes one
  stderr line `warning: 'alva <old>' is deprecated; use 'alva <new>'`, and
  never changes stdout or the exit code.
- B4: A colliding path never silently changes its output. Its migration is in
  §3 D3.
- B5: The embedded dispatch stays strict. It rejects old terminal paths before
  any I/O, as it does today, and gets no aliases.
- B6: Terminal-only capabilities stay terminal-only: `configure`, `auth`,
  `arrays`, `sdk`, local-file flags, legacy `feed` / `deploy`, and the rest of
  the 71 terminal paths with no embedded target. This proposal does not touch
  them.
- B7 (rule from now on): a new command available to both entries must
  register the same path in both catalogs. A parity test enforces this (§5).

## 3. Decision

- D1: Canonical names come from the embedded tree. It is newer, organized by
  resource, already used by the pinned ALPI/Jagent runtime, and renaming it
  would mean another Dispatch release with no user benefit.
- D2: Terminal compatibility uses aliases, not duplicate definitions. Add an
  optional `deprecatedAliases: string[]` to terminal `CommandDefinition`. The
  tree builder registers each alias as a node pointing to the canonical
  definition, tagged with the alias path, so the deprecation hint can name it.
  Help lists only canonical paths. `alva <old-group> --help` prints the
  canonical help with the hint at the top.
- D3: Collisions. Option B is recommended if its precondition passes; option A
  is the fallback.
  - **Option B: re-point the embedded route (no terminal change).** Change
    embedded `trading accounts` and `trading risk-rules` to target the terminal
    handlers (`client.trading.accounts()` / `riskRules()`). Precondition: the
    Gateway response carries every field the Slim Skill and Broker flows need,
    above all the trex account id used by
    `trading broker … --account`. This changes only the embedded output. ALPI
    and Jagent pin the Dispatch version, so the change rolls out through one
    reviewed Dispatch bump plus a Slim Skill check. Venue-native output stays
    reachable as `trading broker accounts` / `trading broker risk-rules`.
  - **Option A: phased terminal rename (if B's precondition fails).**
    1. Minor N: add `trading signals accounts` and `trading signals risk-rules`
       as the canonical home of today's terminal output. The old terminal
       `trading accounts` / `trading risk-rules` keep their behavior and print a
       stderr hint naming both successors (`trading signals accounts` for this
       shape, `trading broker accounts` for venue-native).
    2. Major M: the old terminal paths fail with a usage error that names both
       successors. They do not switch meaning yet.
    3. Major M+1: the paths take on the embedded meaning in both trees.
       The owner may merge steps 2 and 3 if terminal usage telemetry shows no
       remaining callers.
- D4: Aliases are removed one major after the minor that introduces them.
  Removal turns each alias into an `Unknown command` with the canonical
  suggestion (extend `TOP_LEVEL_COMMAND_SUGGESTIONS` and the sub-path error
  text).
- Rejected: renaming the embedded tree to terminal names (another breaking
  Dispatch release, and it brings back the flat `subscriptions` and `functions`
  groups the Slim design removed). Rejected: keeping two trees and documenting
  both (that is the current state, and it produced #204's split).

## 4. Implementation Design

### Renamed routes (canonical ← deprecated terminal alias)

| Family    | Canonical (embedded)                                           | Deprecated terminal alias                                   |
| --------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| account   | `account whoami`                                               | `whoami`                                                    |
|           | `account credits wallet\|items`                                | `credits wallet\|items`                                     |
|           | `account secrets create\|list\|get\|update\|delete`            | `secrets …`                                                 |
|           | `account notifications preferences`                            | `notification-preferences list`                             |
|           | `account service-accounts create\|list\|delete\|grant\|revoke` | `service-account …`                                         |
| playbooks | `playbooks draft`                                              | `release playbook-draft`                                    |
|           | `playbooks release`                                            | `release playbook`                                          |
|           | `playbooks lint`                                               | `lint playbook`                                             |
|           | `playbooks remix`                                              | `remix`                                                     |
|           | `playbooks comments create\|pin\|unpin`                        | `comments …`                                                |
|           | `playbooks follows list\|follow\|unfollow`                     | `subscriptions follows\|follow-playbook\|unfollow-playbook` |
|           | `playbooks functions register\|list\|delete\|invoke`           | `functions …`                                               |
|           | `playbooks functions allowance [get\|list\|create\|revoke]`    | `functions allowance …`                                     |
| portfolio | `portfolio orders`                                             | `trading orders`                                            |
|           | `portfolio equity-history`                                     | `trading equity-history`                                    |
| trading   | `trading signals subscriptions list\|subscribe\|unsubscribe`   | `trading subscriptions\|subscribe\|unsubscribe`             |
|           | `trading broker …` (passthrough)                               | `broker …`                                                  |
| collision | `trading accounts`, `trading risk-rules`                       | see D3                                                      |

That is 41 routes: 14 account, 19 playbooks, 2 portfolio, 4 trading, and the
2 collisions. #204's 7 commands are excluded because they ship with one path
in both trees.

### Embedded actions (decide scope, §6 Q4/Q5)

- 10 embedded-only actions have no terminal path: unified
  `automation create|pause|trigger|set-visibility|runs list|status|logs`,
  `account notifications set-preference`, `playbooks screenshot`,
  `trading signals execute`. Adding them to the terminal CLI is net-new
  behavior, not a rename.
- 15 actions share a path with the terminal (`schedule *`, `steward *`,
  `automation inspect|update|delete|resume`). The automation ones run the
  unified product+producer orchestration on the embedded side. Check that they
  behave the same on both sides before calling them unified.

### Code changes

- `commandDefinitions.ts`: move each renamed command to its canonical path
  with `deprecatedAliases`. Add canonical terminal definitions for the
  embedded paths.
- `commandParser.ts`: register alias nodes, and return `deprecatedFrom` on
  `ParsedCommand` when an alias resolved.
- `dispatch.ts` / `index.ts`: write the hint through the existing stderr
  warning path. Update `COMMAND_HELP` (canonical groups `account`,
  `playbooks`; old group help prints a redirect). For the `trading broker`
  passthrough, accept both `broker …` and `trading broker …` before parsing.
- `embeddedCommandDefinitions.ts`: once both trees share paths, `route()`
  targets become identity for the renamed set. Option B also changes the two
  collision targets.
- README: the terminal reference shows canonical paths, plus a "Deprecated
  aliases" table with the removal version.

### Downstream

- Public Skill (`alva-ai/skills`): switch about 50 references to canonical
  paths in one PR. Merge it only after the Toolkit minor reaches the sandbox
  image (STG bakes npm `next` + skills `main` at build time). Aliases keep
  older images working.
- Slim Skill (sdk-monorepo): no path changes. Recheck the `trading accounts`
  output only under Option B.
- sdk-monorepo: bump the Toolkit submodule and Dispatch version. Embedded
  behavior is unchanged except under Option B.

### Release order

1. Toolkit minor: canonical paths, aliases with hints, parity test.
   Option A step 1 or Option B route change.
2. sdk-monorepo Toolkit pin + Dispatch (main → STG, tag → PRD).
3. STG sandbox image rebuild, then the public Skill switch to canonical names.
4. Next Toolkit major: remove aliases (and Option A step 2).

## 5. Verification

- Alias equivalence: for every alias, parsing the old argv and the canonical
  argv issues the same `_request` call and returns the same stdout. The alias
  writes exactly one stderr hint.
- Terminal inventory golden: canonical paths added, alias paths listed
  separately, no other drift.
- Parity test (B7): every embedded route/action path exists in the terminal
  catalog with the same flag set, except for an explicit allowlist of
  embedded-only actions. Every terminal path either exists in the embedded
  catalog or is on a terminal-only allowlist. New paths fail CI until they are
  classified.
- Embedded strictness: old terminal paths still fail before I/O.
- Collisions: Option B adds a Gateway-vs-Broker field comparison against STG
  with a real key, then contract tests on the new embedded output. Option A
  tests the hint, the usage error, and that the meaning never changes in place.
- `npm test`, `typecheck`, `lint`, `format:check`, `build`, plus the public
  Skill doc eval after its rename PR.

## 6. Human Decisions (open)

1. Approve reversing the 2026-08-14 "terminal stays byte-compatible" decision
   in favor of canonical embedded paths with deprecated terminal aliases?
2. Collisions: Option B (re-point the embedded route, if the Gateway shape is
   sufficient) or Option A (phased terminal rename)?
3. Deprecation window: remove aliases at the next major, or keep them longer?
   Is a stderr hint acceptable for scripts that capture stderr?
4. Should the 10 embedded-only actions (unified automation, runs, screenshot,
   Signal execute) come to the terminal CLI in this project or later?
5. Before the 15 same-path automation/schedule/steward actions are declared
   unified, should they get a behavior-parity audit?
6. Is there per-command terminal usage telemetry to size alias removal and
   Option A's step 3? If not, should the CLI send the resolved path in a
   request header?

## 7. Remaining Work

- Owner decisions in §6, then an aldev plan and implementation PR.
- Independent of this proposal: confirm that `references/api/broker.md:64` in
  the public Skill points to a command whose output carries the trex account id
  used by `broker … --account`.
