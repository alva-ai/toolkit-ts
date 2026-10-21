# chore(release): run the quality gate once per release

## Problem

The 0.32.0-beta.1 STG release (2026-10-21) ran the full quality gate twice and built three times:

- `release-stg.sh` ran lint, format, typecheck, tests and build.
- It rebuilt with the new version.
- Pushing the tag triggered the `pre-push` hook, which reran the whole gate.

That third run comes after `npm publish`, so it cannot stop a bad release. `release.sh` pushes `main` and the tag separately, so the hook ran twice there: three gates in total.

## Change

- Both scripts: the gate no longer builds. The post-bump rebuild already proves the build, and it runs before any push or publish (`set -e`).
- `release-stg.sh`: the tag push uses `--no-verify`.
- `release.sh`: `main` and the tag go in one `git push --atomic --no-verify`. The only change since the gate passed is the version bump.

Each release now runs the gate once and builds once. Pushes made outside the release scripts still run the `pre-push` hook.

## Verification

`bash -n` on both scripts. The next STG release exercises the change.
