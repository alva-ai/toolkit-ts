# feat: add skills tier metadata

## 1. Background

Arrays data-skill docs do not currently return structured tier metadata from
the upstream Arrays API. We still need the `alva skills` CLI to make endpoint
access explicit so agents can know which endpoints are free-access and which
require Pro-tier access.

The source classification for this change is the live endpoint baseline written
to `/Users/likun/Documents/arrays-skill-tier-config-live.md` on 2026-05-06.

## 2. End-to-End Behavior

### Primary behavior

`alva skills list`, `alva skills summary`, and `alva skills endpoint` continue
to call the public Arrays docs API, then the toolkit enriches known Arrays
endpoint docs with local tier metadata.

### Variants

- Skill list responses include default `metadata` and `endpoint_tier_counts`
  for known skills.
- Skill summary responses include default `metadata`, `endpoint_tier_counts`,
  and `endpoint_metadata` for known skills.
- Endpoint responses include `metadata` for known `(skill, file)` pairs.
- Unknown skills or endpoint files keep the prior upstream response shape.

### Failure modes

- Upstream Arrays docs failure still propagates as before.
- Missing local tier metadata does not fail the command; it simply omits the
  enrichment fields.

## 3. Findings

- The CLI implementation lives in `code/public/toolkit-ts`.
- `SkillsResource` already centralizes all `alva skills` calls.
- CLI output is JSON-stringified from the resource result, so adding fields to
  the resource result makes the metadata visible without touching Arrays API.

## 4. Change Specification

- Add a local `SkillEndpointMetadata` table for the 103 live Arrays endpoints.
- Add `tier`, `required_subscription_tier`, `access`, and `pro_required` to
  per-endpoint metadata.
- Enrich `list`, `summary`, and `endpoint` responses in `SkillsResource` by
  default, without an opt-in flag.
- Export the new metadata types from the package entrypoint.
- Update CLI help text to mention local tier metadata.

## 5. Testability Design & Test Plan

- Unit-test `SkillsResource.list()` for endpoint tier counts.
- Unit-test `SkillsResource.summary()` for per-skill endpoint metadata.
- Unit-test `SkillsResource.endpoint()` for exact per-endpoint metadata.
- Run targeted resource tests, typecheck, lint, and build.

## 6. Human Interaction

- @kun-li clarified that Arrays API itself cannot be changed, so the metadata
  should be added in the command-line/toolkit layer.
- @kun-li pointed to `toolkit-ts` as the correct repo.

## 7. Outcome

- Added local endpoint tier metadata for the 103 live Arrays endpoint docs.
- Enriched `SkillsResource.list()`, `summary()`, and `endpoint()` responses
  with tier counts or per-endpoint metadata when the skill/file is known.
- Exported `SkillDoc`, `SkillSummary`, `SkillEndpointMetadata`, and
  `SkillEndpointTier`.
- Updated `alva skills` help text to mention local tier metadata.
- Added resource tests for list, summary, and endpoint enrichment.

Verification run:

- `npm test -- --run test/resources/skills.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `node dist/cli.js skills list | jq '.skills[] | select(.name=="arrays-data-api-polymarket")'`
- `node dist/cli.js skills summary --name arrays-data-api-news | jq '{counts: .endpoint_tier_counts, market: (.endpoint_metadata[] | select(.file=="market-news"))}'`
- `node dist/cli.js skills endpoint --name arrays-data-api-news --file market-news | jq '.metadata'`

## 8. Remaining Tasks

- Open PR and publish a new toolkit version when reviewed.
