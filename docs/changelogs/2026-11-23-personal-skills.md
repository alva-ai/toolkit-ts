# feat: add personalSkills resource and `alva my-skills` CLI

Local changelog for `public/toolkit-ts`. Primary cross-repository design record:
`mono-meta/docs/changelogs/2026-11-23-personal-skills.md`.

## Summary
- Added `PersonalSkillsResource` (`src/resources/personalSkills.ts`) backed by `/api/v1/personal-skills/*` with local relative-path validation and pinned `--rev` file reads.
- Added `alva my-skills list|get|file|save|enable|disable|delete|reindex` in `src/cli/{commandDefinitions.ts,embeddedCommandDefinitions.ts,dispatch.ts,personalSkillsFormat.ts}` for Sandbox, external Agent Link, and ALPI Layer 3.
- Added unit and CLI contract tests in `test/personalSkills.test.ts`.
