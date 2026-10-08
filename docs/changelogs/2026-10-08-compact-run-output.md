# feat(cli): print `alva run` results decoded, and JSON compact off a TTY

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
- B5: `run --help` shows the read-once pattern: redirect stdout to a file, then
  query it with `jq`. It no longer teaches returning `JSON.stringify(...)`.
- F3: The embedded agent runtime (jagent/ALPI) gets B1/B2 too: its tool
  serializes whatever `dispatch` returns, and that is now the decoded value.
- Non-goal: changing Codex's rollout format, or what the server returns in
  `/api/v1/run`.

## 3. Research, Findings, and Architecture Decision

- D1: Decode in the CLI, not the server. `RunResponse.result: string` is a
  published SDK contract that SDK users already parse. Rendering is the CLI's
  job, so the CLI is where the extra layer is removed.
- D2: Decoding the wire layer follows the contract and is lossless. Unwrapping
  further layers is a deliberate heuristic, accepted only when it ends in an
  object or array: decoding any parseable string would turn the text `"42"`
  into the number 42. Nested stringify is exactly the habit that produced the
  incident, and an object cannot be mistaken for prose. There is no depth cap:
  each parse of a string strictly shortens it, so the loop terminates.
- D3: Compact output is gated on `isTTY`, following tools such as `gh`: people
  keep readable output, and pipes and agents get the same document in fewer
  bytes. This applies to all JSON command results, not only `run`, because
  agents read every command through a pipe.
- D5 (withdraws D4): No `--output` flag. An earlier revision added
  `run --output <file>`, which wrote the result to a file and printed a shape
  summary. Once B1 holds, the shell already does this:
  `alva run … > out.json`, then `jq -c '.result…' out.json`, keeps the result
  out of the conversation the same way. The flag added a parser entry, a
  summary format, an envelope it rebuilt by hand, and a hard release dependency
  for the Skill that taught it (`unknown flag` on older CLIs). The operator
  asked for the most elegant version, so it was removed.
- R1: Tools that parse `alva run` stdout and read `.result` as a string to
  `JSON.parse` would break. Before this change, a grep of the skills repo
  found no consumer that parses the envelope; the jagent embedded tool
  serializes the returned value without inspecting `result`.

## 4. Implementation Design

- `src/cli/dispatch.ts`: a private `decodeRunResult` (D2). The `run` case
  awaits the response and returns it with `result` decoded. Help text: the
  `result` field description and two examples.
- `src/cli/index.ts`: indent only when `process.stdout.isTTY` (B3).
- `src/cli/agentHelp.ts`: the embedded `run` help says to return values
  directly.

### Serial Implementation Checklist

- [x] Decode `result` in dispatch.
- [x] Compact non-TTY output.
- [x] Help and agent help.
- [x] Unit tests.
- [x] Local-dev E2E with a sandbox image carrying this CLI.
- [x] Remove `--output` (D5) and re-verify.

## 5. Verification and E2E Design

- Unit tests in `test/cli.test.ts` cover: a decoded object; one and two
  stringify layers; scalar-looking strings kept as written; non-JSON
  passthrough; failed runs; and decoding in the embedded runtime.
- Local-dev E2E (required): a full local stack with a sandbox image whose
  `alva` CLI is this build. Run the same large-result script through the
  baseline CLI (npm 0.31.0) and the new CLI and compare stdout bytes, then run
  a real agent turn that uses `alva run` and check the transcript.

## 6. Human Decisions and Interaction

- The operator ruled out changing Codex's native rollout behavior and asked to
  slim Alva's side instead.
- The operator asked to implement first, then test on local dev using
  worktrees, leaving checkouts that are not part of the PR on main.
- After the first PR revision, the operator asked for the most elegant version.
  That removed `--output` (D5) and the decoder's depth cap.

## 7. Outcome and Evidence

All checks below were run on the final content.

- `npm test`: 52 files, 1119/1119. `npm run typecheck`, `npm run lint`,
  `prettier --check .`, `npm run build`: clean.
- Falsifiability:
  - With decoding bypassed, 9 of the 10 decoding tests fail; only non-JSON
    passthrough still passes.
  - With only the wire layer decoded, exactly the 3 nested-stringify tests
    fail.
- Local-dev E2E setup:
  - Full core stack from origin/main: backend cfc72ba3d, gateway 5ebce8de,
    jagent 40df5667.
  - Two sandbox images from sandbox-agent-ts fcbe86a: a baseline with npm
    toolkit 0.31.0, and a derived image with this CLI and the
    alva-ai/skills#644 files, bundled the way the Dockerfile bundles them.
- Local-dev E2E results:
  - CLI against local `/api/v1/run`, with a research-shaped script ending in
    `JSON.stringify(data)`, stdout piped. Baseline: 17,107 bytes, `result`
    triple-escaped (`"\"{\\\"symbol\\\"…`). This branch: 11,754 bytes, `result`
    a plain object (−31%).
  - On a real pty the output is still indented.
  - `> file` then `jq -c '{status, error}'` and `jq -c '.result.income[:1]'`
    work. `--output` is rejected as an unsupported flag.
  - Codex agent turn (gpt-6-luna), with an identical prompt that runs the
    script once. The model answered correctly on both images. Transcript bytes
    for the run's output:

    |                                   | baseline 0.31.0 | this branch   |
    | --------------------------------- | --------------- | ------------- |
    | CommandExecution `item_completed` | 75,077          | 43,043 (−43%) |
    | model-facing tool output          | 23,326          | 9,913–14,092  |
    | Codex original-token count        | 4,277           | 2,939 (−31%)  |

    The CommandExecution line is deterministic. The model-facing line depends
    on the output budget Codex picks for the call: the two runs on this branch
    truncated at 9,913 and did not truncate at 14,092. Baseline truncated.

  - Second turn: `alva run … > research.json` then
    `jq -c '.result.cashflow[:2]'`. The two commands cost 1,925 transcript
    bytes, and the whole turn 19,313 bytes. Before, reading another field meant
    re-running the script at about 98 KB per run.

## 8. Remaining Work

- Release the toolkit and bump the sandbox-agent-ts toolkit pin
  (`alva-deps.lock.json`). Publish Dispatch/ALPI separately (see AGENTS.md) so
  the embedded runtime gets decoded results.
- alva-ai/skills#644 teaches `.result.<field>` paths. They assume B1, so bump
  its Skill pin after the toolkit pin. On an older CLI the query fails visibly
  ("Cannot index string") rather than silently.
- Codex records each command's output three times. That is upstream behavior
  and out of scope by decision. A source-side transcript budget remains the
  backstop (alva-backend#2861 §8).
