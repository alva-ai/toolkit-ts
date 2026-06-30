# Add credits wallet CLI

Adds a viewer-scoped credits surface to the SDK and CLI.

## What changed

- Added `client.credits.wallet()` for `viewer.creditWallet` balance fields.
- Added `client.credits.items()` for raw credit consumption rows under
  `viewer.creditWallet.items(input:)`.
- Added `alva credits wallet`.
- Added `alva credits items` with `--today`, `--last <duration>`, or
  `--start <time> --end <time>`, plus `--session-id`, `--first`, and
  `--after`.
- The CLI has no `--user-id` option; the backend scopes results to the
  authenticated viewer.

## Examples

```bash
alva credits wallet
alva credits items --today --first 20
alva credits items --last 7d --session-id 2069373335591239680
alva credits items --start 2026-06-23 --end 2026-06-24
```
