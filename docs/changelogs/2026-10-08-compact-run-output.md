# feat(cli): print `alva run` results decoded and compact, add `--output`

## 1. Background and Current State

On 2026-10-07 prd raised the S1 alert "Channel Runtime 循环停滞". The cause was
a task session whose first turn left a 10.4 MB transcript, too large to stage
under the backend's statement budget (alva-backend#2861 raises that budget).
That is a symptom; this change addresses where the bytes come from.

The transcript is Codex's native rollout JSONL. About 77% of it is
`item_completed` CommandExecution events, and Codex records each command's
output three times (`stdout`, `aggregated_output`, `formatted_output`). Alva
stores and restores that file byte for byte, and Codex's format is not ours to
change. What we do control is how much the `alva` CLI prints, and it printed
far more than the agent needed:

- `RunResponse.result` is the JSON encoding of the script's return value. The
  CLI printed the envelope with that string inside it, so every quote in the
  result came out escaped.
- Scripts commonly end with `return JSON.stringify(x)`. Our own `run --help`
  example taught it. That adds a second encoding, so the agent saw JSON inside a
  string inside a string, with backslashes doubling at each layer.
- The envelope was indented with `JSON.stringify(result, null, 2)` even when
  stdout was a pipe read by an agent, not a terminal.
- In the incident turn the agent read the result with
  `jq '.result|fromjson|fromjson|…'` and re-ran the same heavy research script
  17 times to pull out different fields. Each run's full escaped output entered
  the transcript three times.

## 2. Problem Model and End-to-End Behavior

- B1: `alva run` prints `result` as the script's decoded return value: an
  object, array, number, or string, never a JSON document inside a string.
- B2: A script that returned `JSON.stringify(x)`, even more than once, prints
  `x` itself when `x` is an object or array. Strings that only look like JSON
  scalars (`"42"`, `"true"`, `"hello"`) stay exactly as returned, so text
  results are never reinterpreted.
- B3: When stdout is not a TTY, every JSON command result is printed compact
  (no indentation). At a terminal, output is unchanged.
- B4: `alva run --output <path>` writes the decoded result to a local file:
  compact JSON for objects and arrays, raw text for strings. It prints
  `{status, logs, stats, output: {path, bytes, shape}}` instead of `result`.
  `shape` gives the type plus top-level keys (at most 50, with `key_count`
  when truncated) or the array length, which is enough to write the first
  `jq` query.
- F1: A failed run with `--output` writes nothing and prints the normal
  envelope with `error`, so the failure stays visible.
- F2: `--output` with an empty path is a usage error before the run starts.
- F3: The embedded agent runtime (jagent/ALPI) has no local files, so
  `--output` stays unavailable there. It still gets B1/B2: its tool serializes
  whatever `dispatch` returns, and that is now the decoded value.
- Non-goal: changing Codex's rollout format, or what the server returns in
  `/api/v1/run`.

## 3. Research, Findings, and Architecture Decision

- D1: Decode in the CLI, not the server. `RunResponse.result: string` is a
  published SDK contract; SDK users already parse it. The CLI's job is to
  render, so the CLI is where the extra layer is removed.
- D2: Nested decoding is accepted only if it ends in an object or array, up to
  3 extra layers. Decoding any string that parses would turn the text `"42"`
  into the number 42 and silently change results. Objects and arrays are the
  case that produces escaping, and they cannot be confused with prose.
- D3: Compact output is gated on `isTTY`, following tools such as `gh`: people
  keep readable output, and pipes and agents get the same document in fewer
  bytes. This applies to all JSON command results, not only `run`, because
  agents read every command through a pipe.
- D4: `--output` returns a summary rather than the value, so a large result is
  read once and then queried with `jq` against the file. That turns 17 runs
  into 1 run plus cheap queries.
- R1: Tools that parse `alva run` stdout and read `.result` as a string to
  `JSON.parse` would break. Before this change, a grep of the skills repo
  found no consumer that parses the envelope; the jagent embedded tool
  serializes the returned value without inspecting `result`.
- R2: The sandbox image pins the toolkit version. Skills guidance that names
  `--output` must not ship to an image whose toolkit predates this release
  (`unknown flag`). Release order: toolkit → sandbox pin → skills.

## 4. Implementation Design

- `src/cli/dispatch.ts`: `decodeRunResult` (D2), `describeRunResult` (shape
  summary), `runCliOutput` (B1/B4/F1). The `run` case awaits the response and
  passes it through `runCliOutput`. `--output` writes through the existing
  `writeLocalFileBytes`, which already rejects the jagent runtime (F3). The
  help text documents `--output` and decoded `result`, and the example no
  longer returns `JSON.stringify`.
- `src/cli/commandDefinitions.ts`: `run` accepts `--output`. The embedded
  definitions are unchanged (F3).
- `src/cli/index.ts`: indent only when `process.stdout.isTTY` (B3).
- `src/cli/agentHelp.ts`: the embedded `run` help says to return objects
  directly.
- `README.md`: the `run` synopsis lists `--output`.

### Serial Implementation Checklist

- [x] Decode and `--output` in dispatch.
- [x] Compact non-TTY output.
- [x] Help, agent help, README.
- [x] Unit tests.
- [x] Local-dev E2E with a sandbox image carrying this CLI.

## 5. Verification and E2E Design

- Unit tests in `test/cli.test.ts`: decoded objects, one and two stringify
  layers, scalar-looking strings kept as written, non-JSON passthrough, failed
  runs, the embedded runtime decoding, `--output` file bytes and summary, raw
  text output, array and wide-object shapes, no write on failure, empty path
  rejected, `--output` rejected in the embedded runtime.
- Local-dev E2E (required): a full local stack with a sandbox image whose
  `alva` CLI is this build. Run the same large-result script through the
  baseline CLI (npm 0.31.0) and the new CLI, and compare stdout bytes. Then run
  a real agent turn that uses `alva run` and check the transcript.

## 6. Human Decisions and Interaction

- The operator ruled out changing Codex's native rollout behavior and asked to
  slim Alva's side instead.
- The operator asked to implement first, then test on local dev using
  worktrees, leaving checkouts that are not part of the PR on main.
