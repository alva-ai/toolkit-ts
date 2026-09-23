# Repository guidance

## Releases

Publishing the npm CLI does not update ALPI. Also update the Toolkit submodule
and Dispatch version in sdk-monorepo: main publishes to STG; the package release
tag publishes to PRD. Publish Dispatch before dependent Skill/Pi releases.
See [release instructions](README.md#shipping-embedded-cli-changes-to-alpi).
