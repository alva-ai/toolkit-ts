# Repository guidance

## Releases

Publishing the npm CLI does not update ALPI. Also update the Toolkit submodule
and Dispatch version in sdk-monorepo: main publishes to STG; the package release
tag publishes to PRD. Publish Dispatch before dependent Skill/Pi releases.
See [release instructions](README.md#shipping-embedded-cli-changes-to-alpi).

## Command paths

The terminal catalog (`src/cli/commandDefinitions.ts`) and the embedded catalog
(`src/cli/embeddedCommandDefinitions.ts`) are separate, but a new command uses
the same path in both, and an embedded route for it targets that same path.
Use resource-shaped subcommands (`markets watchlist add`, `people follows
follow`), not hyphenated verb-noun leaves (`watchlist-add`). Existing
divergent paths are tracked in
`docs/changelogs/2026-11-05-unify-terminal-embedded-command-trees.md`
(alva-ai/toolkit-ts#205); do not add to them.
