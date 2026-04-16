# fix: auto-decode JSON responses in fs.read()

## 1. Background

The gateway `GET /api/v1/fs/read` returns `Content-Type: application/octet-stream`
for all responses, including ALFS time series virtual paths (`@last`, `@range`,
`@first`) that always contain JSON data. The Browser SDK's `_request()` method
dispatches on content-type: `application/octet-stream` → `response.arrayBuffer()`,
`application/json` → `response.json()`. This means `fs.read()` returns an
`ArrayBuffer` for time series data instead of a parsed JSON object.

Every playbook that reads feed data via the Browser SDK must manually decode
the `ArrayBuffer` to a string and JSON.parse it. Without this workaround,
charts, metric cards, and news feeds display empty ("—") because
`JSON.parse(ArrayBuffer)` throws.

**Relevant systems:**

- `code/public/toolkit-ts/src/resources/fs.ts` — `FsResource.read()`, the
  method that calls `_request` and returns the result directly
- `code/public/toolkit-ts/src/client.ts` — `AlvaClient._request()`, which
  returns `ArrayBuffer` for `octet-stream` responses (line 177)
- `code/backend/alva-gateway/pkg/handler/fs.go:108` — hardcoded
  `application/octet-stream` for all read responses (root cause, not changed
  in this fix)

**Constraints:**

- Single-service change, toolkit-ts only
- Gateway is not modified — fix is client-side
- Must not break binary file reads (images, compiled assets)
- Must be forward-compatible: if gateway later returns `application/json` for
  time series paths, `_request` will return parsed JSON directly and `fs.read`
  must not double-parse

## 2. End-to-End Behavior

### Primary behavior

`client.fs.read({ path: '.../prices/@last/10' })` returns a parsed JavaScript
array of objects (e.g. `[{date, close, volume, ...}, ...]`) instead of an
`ArrayBuffer`. Playbook HTML can use the result directly without manual
`TextDecoder` + `JSON.parse`.

### Edge cases

- **Binary file read** (image, compiled asset): `TextDecoder` with
  `{ fatal: true }` throws on invalid UTF-8, catch returns the original
  `ArrayBuffer` unchanged — same behavior as before.
- **Text file read** (`.js`, `.html`, `.md`): valid UTF-8 but not valid JSON.
  `JSON.parse` fails, `fs.read()` returns the decoded string. This is a
  **minor type change** (`string` instead of `ArrayBuffer`). No known
  consumers treat text file reads as `ArrayBuffer` — playbook HTML always
  expects parsed data or text.
- **Gateway fix in future**: if gateway returns `application/json`, `_request`
  returns parsed JSON (not ArrayBuffer). `fs.read()` receives a non-ArrayBuffer
  value and returns it as-is. No conflict.
- **Empty response**: empty `ArrayBuffer` decodes to empty string, JSON.parse
  fails, returns empty string.

### Failure modes

- Text files now return `string` instead of `ArrayBuffer`. Any consumer
  calling `.byteLength` or `ArrayBuffer`-specific APIs on text read results
  would break. No known consumers do this — playbook reads are always for
  feed data (JSON).
- `TextDecoder({ fatal: true })` adds negligible overhead for binary reads
  (throws on first invalid byte, does not scan the whole buffer).

## 3. Findings

**Approach:** Add a post-processing step in `FsResource.read()` (not in
`_request`). When the result is an `ArrayBuffer`, decode to string with
`TextDecoder`, then try `JSON.parse`. Success → return parsed object. Failure
→ return the decoded string (for text) or ArrayBuffer (for truly binary data
that fails UTF-8 decode).

This is scoped to `fs.read()` only, not `_request()`, because:

- Only fs/read has the octet-stream-but-actually-JSON problem
- Changing `_request` would affect all API calls
- `fs.read` already documents returning `ArrayBuffer | unknown`

Key implementation detail: `TextDecoder` must be constructed with
`{ fatal: true }`. Without it, invalid UTF-8 bytes (binary data) are
silently replaced with U+FFFD instead of throwing, which would return a
corrupted string instead of preserving the original `ArrayBuffer`.

**Risks:**

- Minor type change: text file reads return `string` instead of `ArrayBuffer`.
  No known consumers rely on ArrayBuffer semantics for text reads.
- Performance: `TextDecoder({ fatal: true })` short-circuits on the first
  invalid byte for binary data, so overhead is negligible.

**Scope:** single-service, toolkit-ts only.

**Reference files:**

- Handler pattern: `src/resources/fs.ts` — `read()` method
- Test pattern: existing tests in toolkit-ts (need to check test setup)

## 4. Change Specification

### Affected modules

| Service    | Code                                                    | Deployment                 |
| ---------- | ------------------------------------------------------- | -------------------------- |
| toolkit-ts | `src/resources/fs.ts` — add post-processing in `read()` | npm publish (version bump) |
| toolkit-ts | `test/resources/fs.test.ts` — add decode tests          | none                       |

No other services affected. Gateway, alfs, alva-backend unchanged.

### API changes

None. The HTTP API is unchanged. This is a client-side behavior change
in the SDK's `fs.read()` return value.

### Database impact

None.

### Config changes

None.

### Backward compatibility

**Minor breaking change:** `fs.read()` previously always returned
`ArrayBuffer` for fs/read responses (because gateway returns
`octet-stream`). After this change:

- Time series paths → returns parsed JS object (array)
- Text files → returns `string`
- Binary files → returns `ArrayBuffer` (unchanged)

Consumers that called `TextDecoder` + `JSON.parse` manually will now
get a parsed object directly. Their manual decode will call
`JSON.parse(object)` which stringifies the object first — this would
break. However, the skill doc already instructs this pattern, so it is
the expected migration: remove the manual decode.

### Error path analysis

```
METHOD/CODEPATH         | WHAT CAN GO WRONG        | HANDLING               | USER SEES
------------------------|--------------------------|------------------------|------------------
fs.read() decode step   | Binary: TextDecoder fails | catch → return ArrayBuffer | ArrayBuffer (same as before)
                        | Text: JSON.parse fails    | catch → return string  | string (improved)
                        | JSON: parse succeeds      | return parsed object   | parsed object (fixed)
                        | _request itself fails     | error propagates       | AlvaError (unchanged)
```

No critical gaps.

## 5. Testability Design

### Module boundaries

The change is entirely within `FsResource.read()`. The mock setup in
`fs.test.ts` already stubs `client._request`, so we can control the
return value to simulate ArrayBuffer, string, and parsed JSON responses.

### Coverage diagram

```
CODE PATH COVERAGE
===========================
[+] src/resources/fs.ts
    |
    +-- read()
        +-- [EXISTING] Sends correct request params       -- fs.test.ts
        +-- [PLAN] ArrayBuffer with valid JSON → parsed    -- fs.test.ts
        +-- [PLAN] ArrayBuffer with text (not JSON) → string -- fs.test.ts
        +-- [PLAN] ArrayBuffer with binary → ArrayBuffer   -- fs.test.ts
        +-- [PLAN] Non-ArrayBuffer result → passthrough    -- fs.test.ts
```

Zero gaps.

### Unit test cases

| Test case                         | Mock `_request` returns                       | Expected `read()` returns                         |
| --------------------------------- | --------------------------------------------- | ------------------------------------------------- |
| ArrayBuffer containing JSON array | `ArrayBuffer` of `'[{"date":1,"close":100}]'` | parsed array `[{date:1,close:100}]`               |
| ArrayBuffer containing plain text | `ArrayBuffer` of `'console.log("hi");'`       | string `'console.log("hi");'`                     |
| ArrayBuffer containing binary     | `ArrayBuffer` of `[0x00, 0xFF, 0x80]`         | original `ArrayBuffer` (TextDecoder fatal throws) |
| Non-ArrayBuffer (already parsed)  | `{some: "object"}`                            | `{some: "object"}` passthrough                    |
| Empty ArrayBuffer                 | `ArrayBuffer` of `''`                         | `''` (empty string, JSON.parse fails)             |

### E2E Required: no

Single-service, client-side only. No cross-service interactions. Unit
tests with mocked `_request` are sufficient.

## 6. Human Interaction

_Captured during review._

## 7. Outcome

_Filled after implementation._

## 8. Remaining Tasks

_Filled after implementation._
