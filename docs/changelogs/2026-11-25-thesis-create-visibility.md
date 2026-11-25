# fix(thesis): require --visibility on create; list asset-candidates; return the web url

Local record. The primary record is frontend-monorepo
`docs/changelogs/2026-11-12-connect-your-ai-agent.md` (external agents
connecting through the Alva skill's BOOTSTRAP.md); found in two real runs on
CLI 0.37.0.

## Change

- `alva thesis create` requires `--visibility public|private`, like `update`.
  It used to default to public, so an agent that left the flag out published a
  Thesis meant to stay private. A missing flag is a usage error before any
  request. The SDK's `theses.create` is unchanged.
- `alva thesis --help` lists `asset-candidates` and `return` as subcommands.
  An agent read the list, told the user `asset-candidates` did not exist, and
  found it later under "Other flags". The help also says an `UNRESOLVED`
  mention or `UNKNOWN` direction is an answer, not an error. Agent help gets
  the same changes.
- `theses.create` returns `url`, the Thesis's web page on the API's
  environment (`https://alva.ai/thesis/<id>`, `https://stg.alva.ai/...` on
  STG), from the existing `webOriginFromApiBase`, so agents stop building the
  link themselves.

The CLI keeps group-level help only; a per-subcommand `--help` for
`asset-candidates` would be the only one of its kind, so it is not added.

## Rollout

Release only after the Alva skill passes `--visibility` on every create:
alva-ai/skills#702 adds it to the publish command in `references/thesis.md`
and the agent routine, and the platform's copy (`skills/skill` in
sdk-monorepo) follows the next alva-ai/skills release. A skill that omits the
flag gets a usage error naming it; agents retry with it, but the publish
preview would no longer match the call.

## Verification

`npx vitest run` (64 files, 1492 tests; new: create without `--visibility`
rejected on terminal and embedded paths without calling the resource, and the
STG web url), `npx tsc --noEmit`, `npx eslint src test`, `npx prettier --check`
on changed files.
