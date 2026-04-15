# Tasks: feat: add --local-file flag to alva run

## Task 1: Add --local-file tests and implementation

**Complexity:** simple
**Dependencies:** none

**Files:** `src/cli/index.ts`, `test/cli.test.ts`

**What to do:** Add `--local-file <path>` flag to the `run` command.
In `dispatch()`, before calling `client.run.execute()`, check for mutual
exclusion between `--code`/`--local-file` and `--local-file`/`--entry-path`.
If `--local-file` is set, read the file with `fs.readFileSync(path, 'utf-8')`
and pass contents as `code`. Update help text. Mock `fs.readFileSync` in
tests via `vi.mock('fs')`.

**Steps:**

- [ ] Write failing tests: --local-file happy path, --local-file with --args,
      --code + --local-file conflict, --local-file + --entry-path conflict,
      --local-file file not found, help text includes --local-file
- [ ] Run tests, verify they fail: `npx vitest run`
- [ ] Implement: update help text, add mutual exclusion + readFileSync in
      `run` case of `dispatch()`
- [ ] Run tests, verify they pass: `npx vitest run`
- [ ] Run linting: `npx eslint src/ test/`

## Dependency graph

```
Task 1 (single task, no dependencies)
```
