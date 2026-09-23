# Repository guidance

## Embedded CLI delivery

Follow [Shipping embedded CLI changes to ALPI](README.md#shipping-embedded-cli-changes-to-alpi)
for changes consumed by the Agent.

- Terminal and embedded catalogs/parsers/help are independent. Verify the
  embedded path and shared SDK validation against the Backend contract.
- Test omitted/empty collections and relevant pagination, idempotency, and
  permissions. Use mocks rather than real messages for argument-validation tests.
- Toolkit main and npm publication are not Agent deployment. Coordinate the
  sdk-monorepo gitlink, independent Dispatch artifact version/publication, and
  affected Slim Skill instructions and runtime requirements.
- Record STG and PRD evidence separately, including artifact/source versions and
  consumer readback. Explicitly state intentional deferrals.
- Compatible Dispatch changes alone do not require Pi/JAgent rebuilds or changes
  to JAgent registry rollout policy.
- Docs-only changes do not authorize version bumps, release tags, publication,
  or deployment. Never claim runtime defects are fixed by documentation alone.

Outstanding cross-repository work:
[sdk-monorepo #191](https://github.com/alva-ai/sdk-monorepo/issues/191).
