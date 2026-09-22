# Toolkit Thesis exact author-version read

The Toolkit SDK and terminal/embedded CLI now expose the Gateway REST contract
`GET /api/v1/theses/:id/versions/:version_id` as `theses.getVersion(...)` and
`alva thesis version get --id <thesis-id> --author-version-id <version-id>`.
The command returns only the requested immutable author version and does not
list or fall back to another version.
