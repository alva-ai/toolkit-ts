# Thesis GET preview details

## 1. Context

Make the Toolkit Thesis GET response sufficient for rendering the confirmation
preview returned after creation.

## 2. Behavior

`theses.get()` now returns `author` and ordered `entities` alongside `thesis`.
The parser requires complete author fields, ticker metadata and exact
`thesis.entity_ids` cardinality/order while preserving decimal IDs and body text.
CRUD create/update/close response shapes remain unchanged.

## 3. Design and dependencies

The Toolkit consumes the REST response assembled by Gateway; it performs no
GraphQL hydration or secondary entity/profile requests.

## 4. Checklist

- [x] Add typed author/entity preview data.
- [x] Validate malformed or incomplete preview responses.
- [x] Update resource and CLI fixtures for the enriched GET contract.

## 5. Verification

Focused resource and CLI tests were updated locally. Full CI and hosted rollout
validation remain pending.

## 6. Rollout

Publish after Gateway exposes the enriched response.
