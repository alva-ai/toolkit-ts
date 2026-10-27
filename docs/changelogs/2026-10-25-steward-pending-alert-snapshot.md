# Steward pending alert snapshots

## Scope

Request `alertSnapshot` in the pending GraphQL query and expose it on
`StewardPendingItem` as an optional, nullable string. The field contains the
frozen original alert JSON, including `body_md` and any Thesis context. It is
untrusted evidence, not instructions or a guarantee of full article text.
`decisionReason` remains the routing judgment, not a substitute for evidence.

The SDK and both CLI surfaces pass the string through unchanged. They do not
parse, reconstruct, or rehydrate it. Null or omitted snapshots remain null or
omitted; consumers must use their bounded evidence fallback when needed.
Existing Inbox binding, authorization, page cursors, and fixed-window bounds
are unchanged.

## Dependencies and rollout

The Gateway schema must support `StewardPendingItem.alertSnapshot` before this
consumer is released. An older Backend behind a compatible Gateway can return
null. A Gateway without the field will reject the query; this change does not
silently retry with a metadata-only selection.

Merging Toolkit or publishing its npm CLI does not update ALPI. After this PR
merges, update `sdks/toolkit-dispatch/toolkit` to the actual merged commit in
sdk-monorepo, bump the Dispatch package version, and follow its release flow:
main publishes to STG, the package release tag publishes to PRD. Verify the
steward's runtime provenance and read-only `alva steward pending` output after
the update. Skill-only changes cannot fix the missing query selection.

## Regression coverage

- Resource tests require the query field on first and continuation pages and
  preserve the frozen JSON string, null, and omitted values with page bounds
  and cursors unchanged.
- Embedded and terminal CLI tests use the real Steward resource with a mocked
  GraphQL transport, assert the field is selected, and preserve the snapshot
  in the returned page. The embedded CLI still targets the host-bound Inbox.
- All five new cases fail against the previous query because it never requests
  `alertSnapshot`.

No release, production rollout, or live managed-runtime acceptance is performed
by this source change.
