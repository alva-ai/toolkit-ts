# Select completed earnings independently of the page default

## Problem and approved behavior

PRD reads for AAPL, MSFT and VRT returned an upcoming quarter when the caller
requested `latest-completed`. The Backend page default intentionally switches
to the next quarter during the pre-earnings window; it is not a completion
selector.

Select the most recent `COMPLETED` period by earnings date from the catalog.
Keep `next-confirmed`, explicit fiscal selection and Backend defaults unchanged.
If no completed period exists, report `MARKETS_EARNINGS_EVENT_NOT_FOUND` before
requesting detail. No Feed, Backend, schema or storage change is required.

## Implementation and verification

- Updated `src/resources/markets.ts` using the existing catalog and error path.
- Added resource regressions for an upcoming default, unordered completed
  periods, upcoming-only periods and an empty catalog. Three regressions failed
  against the original implementation before the fix.
- Node 24: all 1,347 tests passed, including resource and CLI coverage;
  typecheck, lint, repository formatting and build checks passed.
- The rebuilt CLI read PRD as an ordinary consumer: `latest-completed` selected
  AAPL FY2026 Q3, MSFT FY2026 Q4 and VRT FY2026 Q2. Each `next-confirmed` request
  still selected the upcoming quarter. These six reads changed no online data.

## Delivery

The companion sdk-monorepo change pins this Toolkit revision and bumps Dispatch
so the embedded CLI receives the same fix. Merge the Toolkit change first.
Main publication targets STG; PRD publication and live installed-client
acceptance are separate steps. No production deployment occurs in this change.
