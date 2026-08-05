# fix: remove obsolete data-skills tier metadata

## 1. Background

Arrays now exposes all previously Pro-gated functionality. The toolkit still
enriches public Arrays skill documentation with a local static endpoint tier
table. That table can tell agents that an endpoint is `pro only` even though
the live service no longer has that restriction.

## 2. End-to-End Behavior

### Primary behavior

`alva data-skills list`, `summary`, and `endpoint` enrich live Arrays
documentation with the maintained endpoint inventory, without adding local
subscription-tier metadata.

### Variants

- Human-readable output can contain endpoint counts and method/path/file
  locations, but contains no tier or access labels.
- JSON output can contain endpoint inventory metadata, but contains no local
  tier counts or endpoint access fields.

### Failure modes

- Arrays documentation request failures and empty document responses retain
  their existing behavior.

## 3. Findings

- `src/resources/skillTiers.ts` combines a needed endpoint inventory with the
  obsolete endpoint access fields.
- `DataSkillsResource` enriches all three data-skills operations from that
  table.
- `dataSkillsFormat.ts` converts the enrichment into `pro only` CLI text.
- A dedicated script and scheduled workflow keep the endpoint inventory in
  sync with Arrays and must remain after the access fields are removed.

## 4. Change Specification

### Affected modules

- Replace the static skill tier table with an endpoint-only registry containing
  `skill`, `file`, `method`, and `path`.
- Keep `DataSkillsResource` endpoint inventory enrichment without access
  fields.
- Simplify data-skills text formatting to show endpoint locations but exclude
  tier/access summaries.
- Keep and adapt the registry audit script/workflow so new rows never default
  to Pro.

### API changes

- Keep `metadata` and `endpoint_metadata` for endpoint inventory fields.
- Stop adding `endpoint_tier_counts`, `pro_count`, or endpoint access fields.
- Preserve obsolete tier-related type members only as deprecated optional
  declarations for TypeScript source compatibility.

### Database impact

- None.

## 5. Testability Design & Test Plan

### Testability design

- Mock `AlvaClient._request` at the resource boundary.
- Assert known skills and endpoints are returned exactly as supplied by Arrays.
- Exercise CLI formatters through the existing dispatch tests.

### Unit tests

| Test case                   | Input                       | Expected                                  |
| --------------------------- | --------------------------- | ----------------------------------------- |
| Endpoint registry           | Known Options endpoints     | Location fields only; no access fields    |
| List known skill            | Arrays list response        | Endpoint count without tier counts        |
| Fetch known skill summary   | Arrays summary response     | Endpoint inventory without tier fields    |
| Fetch formerly Pro endpoint | Arrays endpoint response    | Endpoint location without access metadata |
| Human-readable output       | List, summary, and endpoint | Locations/counts without tier/Pro labels  |

### Integration tests

- Not required; the external request shape and URL remain unchanged.

### Edge cases

- Empty endpoint/summary responses keep the existing explicit errors.

## 6. Human Interaction

### Initial thoughts

The user confirmed that Arrays has opened all Pro functionality and requested
syncing toolkit `main` before removing the static information from toolkit
source.

### Agent responses

The initial implementation removed the registry audit together with the tier
table. The user clarified that the registry and scheduled audit remain needed;
only Pro/tier restriction annotations should be removed. The implementation was
corrected to preserve endpoint inventory maintenance and remove only access
classification.

## 7. Outcome

### Changes made

- Replaced the local endpoint tier table with an endpoint-only registry holding
  `skill`, `file`, `method`, and `path`.
- Kept endpoint count and location enrichment in data-skills responses.
- Removed human-readable tier, access, and Pro-count formatting from the CLI.
- Adapted the registry audit script and daily workflow to maintain endpoint
  inventory without defaulting new rows to Pro.
- Synced two live registry additions: `short-interest` and `x-handles`.
- Preserved obsolete tier-related type members as deprecated optional fields
  for source compatibility; runtime registry rows do not populate them.

### Tests added

- Added registry coverage proving endpoint rows contain no subscription-tier
  fields.
- Added resource coverage for endpoint counts, endpoint inventory, and a
  formerly Pro-only endpoint without access metadata.
- Updated CLI coverage to preserve endpoint locations while excluding Pro,
  tier, and access labels.

### Verification

- Full Vitest suite: 41 files and 715 tests passed.
- Live registry audit: 119 entries across 19 skills, result `in sync`.
- TypeScript typecheck passed.
- ESLint passed for all changed TypeScript files.
- Prettier check passed for all changed source, test, and changelog files.
- `git diff --check` passed.

### Migration

- None.

## 8. Remaining Tasks

- Publish and roll out a new toolkit version so deployed agents receive the
  corrected data-skills behavior.
