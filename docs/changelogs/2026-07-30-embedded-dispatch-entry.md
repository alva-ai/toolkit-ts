# Runtime-neutral embedded dispatch

## 1. Background

The public embedded dispatcher shared one entry with the Node CLI. Importing
`@alva-ai/toolkit/cli` therefore loaded Node-only authentication, filesystem,
stdio, and Undici modules even when an embedding runtime selected Jagent mode.

## 2. End-to-end behavior

Embedded callers import `@alva-ai/toolkit/dispatch`, provide an `AlvaClient`,
argv, and runtime capabilities, and receive command results directly. The
terminal CLI imports the same dispatcher and supplies its Node adapters.

## 3. Findings

- Command parsing and Jagent behavior already existed and should not be copied.
- Local files, stdin/stdout, UUID generation, and fetch dispatcher tuning are
  runtime capabilities rather than command-dispatch responsibilities.
- Design lint itself is runtime-neutral; only its local-file and diagnostic
  sinks require adapters.

## 4. Change specification

- Add `@alva-ai/toolkit/dispatch` as a browser-platform ESM export.
- Export `CliUsageError` from the same entry so embedded callers use the
  dispatch bundle's error identity for reliable `instanceof` checks.
- Move shared command parsing and dispatch into `src/cli/dispatch.ts`.
- Keep config, login, local filesystem, stdio, and Undici in
  `src/cli/index.ts`.
- Split runtime-neutral lint behavior from its Node wrapper.
- Preserve the existing `@alva-ai/toolkit/cli` API and command behavior.

## 5. Testability design

- Existing CLI dispatch tests continue through the Node wrapper.
- Typecheck and build validate both entrypoints.
- Building the dispatch entry with `platform: browser` rejects accidental
  Node-only imports.

## 6. Implementation notes

`DispatchRuntimeDeps` is the capability boundary. Jagent supplies no local
filesystem or process capabilities, while the Node wrapper supplies all of
them and retains existing CLI behavior.

## 7. Outcome

Toolkit now exposes a runtime-neutral dispatcher while preserving the Node CLI
as a compatibility wrapper. The embedded entry builds without Node built-ins,
and version reporting is available to embedded agents without entering the
terminal-only `main()` path.

Final verification:

- ESLint passed.
- TypeScript typecheck passed.
- All 40 test files and 705 tests passed, including 303 CLI tests.
- All SDK, CLI, dispatch, and browser bundles built successfully.

## 8. Remaining tasks

Publish the next Toolkit version before updating downstream package pins.
