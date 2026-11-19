# Changelog

Releases before 1.0.0 are listed under the repository's tags.

## 1.0.0 (unreleased)

1.0.0 moves the SDK and CLI from `/api/v1` and GraphQL to the platform API,
`/api/v2`. Migration notes: [README](README.md#migrating-from-0x-to-10).

### Breaking

- IDs are opaque strings (`AlvaId`) in the platform format (`task_0…`);
  numeric IDs are no longer returned or accepted.
- Resources call `/api/v2`. The changes of each resource are listed here as
  it moves.

### Added

- `AlvaError.requiredPermission`, `invalidParams` and `retryAfter`, read from
  the RFC 9457 problems `/api/v2` returns. The CLI prints them with the error.
- Every write sends an `Idempotency-Key`.
