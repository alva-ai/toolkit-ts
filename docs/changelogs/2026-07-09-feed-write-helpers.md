# feat: add feed output write helpers

## 1. Background

Alvest memory is moving from local JSON files to ALFS-backed feed storage. The
existing CLI can write ordinary ALFS files with `alva fs write`, read feed
outputs with `alva fs read .../@last/N`, publish feeds with `alva release feed`,
and manage feed lifecycle with `alva feed list|stop|resume|delete|set-visibility`.

Direct feed output writes should stay out of the end-user CLI for now, but SDK
callers still need a small helper that wraps the synth write shape safely. The
Feed SDK writes output through ALFS synth paths under
`~/feeds/<name>/v1/data/<group>/<output>`. Callers should pass flat records with
a `date` field and avoid hand-rolling `{date, value}` synth points.

Relevant systems:

- `src/resources/feed.ts` -- feed lifecycle resource and the new output helpers.
- `src/resources/fs.ts` -- existing ALFS write surface used by the new helper.
- `test/resources/resources.test.ts` -- resource unit tests.

## 2. End-to-End Behavior

SDK callers pass a feed output path and Feed SDK-style flat records. The helper
validates that the payload is a non-empty array of objects, each with a numeric
`date`, converts every record into the synth write point shape
`{date, value: record}`, and writes it to:

```text
~/feeds/alvest-memory/v1/data/journal/notes/@append
```

Typedoc callers pass a TypeSeriesTypeDoc object and the helper writes its JSON
string to:

```text
~/feeds/alvest-memory/v1/data/journal/notes/@typedoc
```

Edge cases:

- `path` may point to the output root or already end in `@append` / `@typedoc`;
  the helper normalizes the path.
- Non-array write payloads, empty record arrays, missing `date`, non-object
  records, and invalid typedoc objects fail before any API call.
- Raw synth points are intentionally not exposed in the helper; callers should
  pass Feed SDK-style flat records.

## 3. Findings

Chosen approach: add thin helpers to `FeedResource` that wrap `client.fs.write`.
This keeps the SDK surface explicit without requiring a new gateway REST
endpoint or exposing extra CLI commands that users do not need.

This is intentionally a low-level creator/agent utility, not a replacement for
normal scheduled feed producers. For production feed pipelines, agents should
still write Feed SDK source, run it with `alva run`, deploy a cronjob, and
publish automation. For Alvest memory, however, the writer is the interactive
agent itself, so a programmatic append helper is appropriate.

Risks:

- Backend support for feed synth suffixes is an ALFS contract. Tests here mock
  SDK calls; live compatibility is covered by existing ALFS/feed e2e tests in
  backend repos, not by toolkit unit tests.
- Appending arbitrary payload JSON can create large records. The Alvest memory
  layer must still sanitize and compact before calling this helper.

Scope shape: single submodule, `toolkit-ts` only. No gateway, backend, DB, or
proto changes.

Reference files:

- Resource pattern: `src/resources/feed.ts`, `src/resources/fs.ts`
- Test pattern: `test/resources/resources.test.ts`

## 4. Change Specification

Add SDK types:

- `FeedWriteRequest`
- `FeedWriteResponse`
- `FeedTypedocRequest`
- `FeedTypedocResponse`

Add `FeedResource` methods:

- `write(params)` -- normalize output path to `@append`, validate records,
  convert flat records to synth write points, call `client.fs.write`.
- `typedoc(params)` -- normalize output path to `@typedoc`, validate typedoc
  object shape, call `client.fs.write`.

Do not add `alva feed write` or `alva feed typedoc` CLI commands. Agents can use
the SDK helper directly or the lower-level ALFS path once the synth mount exists.

## 5. Testability Design

Unit tests:

- `FeedResource.write()` sends `fs.write` to `<path>/@append` with wrapped
  synth points.
- `FeedResource.write()` accepts an already suffixed `@append` path.
- `FeedResource.write()` rejects invalid records before API calls.
- `FeedResource.typedoc()` sends `fs.write` to `<path>/@typedoc`.
- `FeedResource.typedoc()` rejects invalid typedoc before API calls.

Commands:

```bash
npm test -- test/resources/resources.test.ts
npm run typecheck
```

## 6. Human Interaction

User initially requested a first-class feed write CLI before migrating Alvest
memory to ALFS/feed storage. During review we decided the extra CLI commands are
not needed; the reusable SDK helper is enough.

## 7. Outcome

- Added `FeedResource.write()` and `FeedResource.typedoc()`.
- Kept `alva feed` focused on lifecycle and visibility commands.
- Added resource tests for happy paths, path normalization, and invalid
  payloads.

Verification:

```bash
npm test -- test/resources/resources.test.ts
npm run typecheck
git diff --check
npx prettier --check README.md src/resources/feed.ts src/types.ts test/resources/resources.test.ts docs/changelogs/2026-07-09-feed-write-helpers.md
```

## 8. Remaining Tasks

- Wire Alvest memory to provision the synth mount before writing feed-backed
  records.
- Define the Alvest feed storage path and read strategy in the skill docs.
