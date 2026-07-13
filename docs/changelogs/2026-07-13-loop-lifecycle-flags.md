# feat(cli): replace `--expires-in` with bounded loop lifecycle flags

`alva loop create` now accepts:

- `--start now|<RFC3339>` (default `now`)
- `--until <RFC3339>` (exclusive)
- `--runs <positive integer>`

At least one of `--until` or `--runs` is required, so loop sugar cannot create
an unbounded loop. Explicit timestamps must include a timezone. `now` is sent
without a client timestamp and resolved by the backend clock.

`--expires-in` is removed with no compatibility alias; using it is a CLI error.
