# feat: add feed output write CLI

## 1. Background

Alvest memory is moving from local JSON files to ALFS-backed feed storage. The
current CLI can write ordinary ALFS files with `alva fs write`, read feed output
with `alva fs read .../@last/N`, publish feeds with `alva release feed`, and
manage feed lifecycle with `alva feed list|stop|resume|delete|set-visibility`.
It does not expose a first-class command for writing feed output records.

The Feed SDK writes output through ALFS synth paths under
`~/feeds/<name>/v1/data/<group>/<output>`. The SDK accepts flat records with a
`date` field and converts them into synth write points. Agents should not have
to know that low-level storage shape.

Relevant systems:

- `src/resources/feed.ts` — feed lifecycle resource, currently no output write.
- `src/resources/fs.ts` — existing ALFS write surface used by the new helper.
- `src/cli/index.ts` — dispatch, help text, JSON/file flag parsing, jagent
  local-file guardrails.
- `test/resources/resources.test.ts` — resource unit tests.
- `test/cli.test.ts` — CLI dispatch tests.

## 2. End-to-End Behavior

Primary behavior:

```bash
alva feed write \
  --path '~/feeds/alvest-memory/v1/data/journal/notes' \
  --data '[{"date":1783555200000,"id":"n1","summary":"opened NVDA thesis"}]'
```

The CLI validates that the payload is a non-empty JSON array of objects, each
with a numeric `date`, converts each flat record into the synth write point
shape `{date, value: record}`, and writes it to:

```text
~/feeds/alvest-memory/v1/data/journal/notes/@append
```

The command also supports `--file <local-json-file>` in normal Node.js CLI mode
and rejects it in jagent mode with the existing local-file guidance.

Typedoc behavior:

```bash
alva feed typedoc \
  --path '~/feeds/alvest-memory/v1/data/journal/notes' \
  --data '{"name":"Journal Notes","description":"...","fields":[...]}'
```

This writes the typedoc JSON string to:

```text
~/feeds/alvest-memory/v1/data/journal/notes/@typedoc
```

Edge cases:

- `--path` may point to the output root or already end in `@append` /
  `@typedoc`; the helper normalizes the path.
- Invalid JSON, non-array write payloads, empty record arrays, missing
  `date`, non-object records, and invalid typedoc objects fail before any API
  call.
- Raw synth points are intentionally not exposed in the MVP; callers should
  pass Feed SDK-style flat records.

## 3. Findings

Chosen approach: add thin helpers to `FeedResource` that wrap `client.fs.write`.
This keeps the SDK/CLI surface explicit without requiring a new gateway REST
endpoint.

This is intentionally a low-level creator/agent utility, not a replacement for
normal scheduled feed producers. For production feed pipelines, agents should
still write Feed SDK source, run it with `alva run`, deploy a cronjob, and
publish automation. For Alvest memory, however, the writer is the interactive
agent itself, so a direct append command is appropriate.

Risks:

- Backend support for feed synth suffixes is an ALFS contract. Tests here mock
  SDK calls; live compatibility is covered by existing ALFS/feed e2e tests in
  backend repos, not by toolkit unit tests.
- Appending arbitrary payload JSON can create large records. The Alvest memory
  layer must still sanitize and compact before calling this CLI.

Scope shape: single submodule, `toolkit-ts` only. No gateway, backend, DB, or
proto changes.

Reference files:

- Resource pattern: `src/resources/feed.ts`, `src/resources/fs.ts`
- CLI pattern: `src/cli/index.ts` `feed` switch and local-file helpers
- Test pattern: `test/resources/resources.test.ts`, `test/cli.test.ts`

## 4. Change Specification

Add SDK types:

- `FeedWriteRequest`
- `FeedWriteResponse`
- `FeedTypedocRequest`
- `FeedTypedocResponse`

Add `FeedResource` methods:

- `write(params)` — normalize output path to `@append`, validate records,
  convert flat records to synth write points, call `client.fs.write`.
- `typedoc(params)` — normalize output path to `@typedoc`, validate typedoc
  object shape, call `client.fs.write`.

Add CLI commands:

- `alva feed write --path <output-path> (--data <json> | --file <file>)`
- `alva feed typedoc --path <output-path> (--data <json> | --file <file>)`

Update help and README command list to include the new commands.

## 5. Testability Design

Unit tests:

- `FeedResource.write()` sends `fs.write` to `<path>/@append` with wrapped
  synth points.
- `FeedResource.write()` accepts an already suffixed `@append` path.
- `FeedResource.write()` rejects invalid records before API calls.
- `FeedResource.typedoc()` sends `fs.write` to `<path>/@typedoc`.
- `FeedResource.typedoc()` rejects invalid typedoc before API calls.
- CLI dispatch calls `client.feed.write()` for inline `--data`.
- CLI dispatch calls `client.feed.write()` for `--file`.
- CLI dispatch calls `client.feed.typedoc()` for inline `--data`.
- CLI rejects missing/mutually exclusive data flags and local file reads in
  jagent mode.

Commands:

```bash
npm test -- test/resources/resources.test.ts test/cli.test.ts
npm run typecheck
```

## 6. Human Interaction

User requested a first-class feed write CLI before migrating Alvest memory to
ALFS/feed storage. No product behavior beyond the CLI/SDK surface was requested
for this step.

## 7. Outcome

- Added `FeedResource.write()` and `FeedResource.typedoc()`.
- Added `alva feed write --path ... (--data ... | --file ...)`.
- Added `alva feed typedoc --path ... (--data ... | --file ...)`.
- Updated CLI help and README command summary.
- Added resource and CLI tests for happy paths, path normalization, invalid
  payloads, mutually exclusive flags, and jagent local-file rejection.

Verification:

```bash
npm test -- test/resources/resources.test.ts test/cli.test.ts
npm run typecheck
git diff --check
npx prettier --check README.md src/cli/index.ts src/resources/feed.ts src/types.ts test/cli.test.ts test/resources/resources.test.ts docs/changelogs/2026-07-09-feed-write-cli.md
```

## 8. Remaining Tasks

- Wire Alvest memory to use the new feed write CLI directly.
- Remove the local Alvest memory backend once feed-backed reads are implemented.
- Define the Alvest feed storage path and read strategy in the skill docs.
