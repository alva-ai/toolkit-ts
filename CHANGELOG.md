# Changelog

Releases before 1.0.0 are listed under the repository's tags.

## 1.0.0 (unreleased)

1.0.0 moves the SDK and CLI to Alva's platform API, `/api/v2`, and exposes its
shapes as they are. CLIs and SDKs on 0.x keep working against `/api/v1`.
Migration notes: [README](README.md#migrating-from-0x-to-10).

### Breaking

- Outputs are the `/api/v2` API shapes. Every SDK result, and the CLI's JSON
  output (the default of commands without a human formatter, and `--json` on
  every command), is the JSON of the route the method calls: camelCase
  members, opaque string IDs (`thesis_0…`), `{items, nextPageToken}` pages,
  RFC 3339 times and decimal strings. The contract is the OpenAPI 3.1
  document served at
  [`GET /api/v2/openapi.json`](https://api-llm.prd.alva.ai/api/v2/openapi.json)
  and vendored as `openapi/alva-platform-v2.json`; the SDK's types are
  generated from it and exported (`Schema<'Thesis'>`, `components`, `paths`,
  `V2Query`). The CLI's human formatters are kept and read the `/api/v2`
  fields.
- Errors: an `AlvaError` from `/api/v2` carries the problem's `code`,
  `status`, `detail` (as `message`), `reason` (a public reason such as
  `IDEMPOTENCY_KEY_REUSED`, `PAGE_TOKEN_INVALID` or `INSUFFICIENT_CREDITS`;
  the `Problem` schema lists them), `type`
  (`https://alva.ai/problems/<reason or code>`), `requiredPermission`,
  `invalidParams` and `retryAfter`. One parser reads `/api/v2` problems and
  `/api/v1` errors. A route answer that is not a JSON object is
  `INVALID_RESPONSE` (502). The CLI's error JSON adds `reason` and `type`.
- Credentials: `/api/v2` methods take an API key. A client holding a
  `pbsvToken` or `viewer_token` is refused before anything is sent, with
  `CREDENTIAL_REQUIRED` (401): use `client.v1`, or the 0.36 browser bundle
  in a page.
- Browser: 1.x has no browser build. `dist/browser.global.js`
  (`@alva-ai/toolkit/browser`) is the published 0.36.0 bundle, unchanged, so
  unversioned unpkg URLs in published Playbook pages keep their 0.36
  behavior. Pin `https://unpkg.com/@alva-ai/toolkit@0.36/dist/browser.global.js`.
- Writes and retries: every POST and PATCH sends one `Idempotency-Key` per
  call, as an RFC 9651 string (`"<uuid>"`): the caller's `idempotencyKey`
  (or request ID) or a new UUID. A network error, 409
  `IDEMPOTENCY_KEY_IN_USE`, 429 with a `Retry-After` of at most 30 s, and
  502, 503 and 504 are retried with the same key and body bytes: at most 3
  attempts within 60 s, waiting 0.5 s × 2^(n-1) ±20 % and at least
  `Retry-After`. 500, other 4xx and other 409s are not retried; neither is a
  timed-out or aborted attempt. GET and DELETE are retried the same way.

### Moved to `client.v1`

Methods without an `/api/v2` route keep their 0.x types, IDs and credentials
under `client.v1`, and move back when their route exists:

- `steward` (GraphQL `/query`);
- `secrets.get` (the secret's value);
- `notifications.listFeed`;
- feed subscriptions (`subscriptions.subscribeFeed`, `unsubscribeFeed`);
- channel group subscriptions (`channelGroupSubscriptions`, CLI
  `alert group`);
- `trading.subscribe({ executeLatest: true })`;
- Playbook and Skillhub discovery without an API key;
- the `auth login` token exchange (`/api/v1/oauth/token`).

### Renamed and removed

- `trading.execute` is
  `trading.placeOrders(accountId, instruction, { idempotencyKey })`, on
  `POST /api/v2/broker-accounts/{accountId}/orders`.
- `asks.create()` returns the ask operation; `asks.wait(operation)` polls it
  (1, 2 and 4 s, then every 5 s, for at most 35 minutes); `alva ask` waits.
- `--since` takes an RFC 3339 time only (a number is refused);
  `--newer-than` stays removed.
- `getByIds([])` returns `[]` without a request; reads that return `null`
  for a missing resource do so only on 404 (403 is thrown).

### Per resource

Each resource lists its changes here as it moves to the `/api/v2` shapes.
