# feat!: content resources on /api/v2 (Toolkit 1.0, M20)

Primary record: alva-gateway/docs/changelogs/2026-11-19-agent-api-permissions.md
(R16, D16, Appendices B and C, the M10 client mapping). Transport:
`2026-11-19-agent-api-v2.md`.

## 1. Background and Current State

- The content resources (`theses`, `thesisReads`, `thesisPublication`,
  `forYou`, `feed`, `playbooks`, `comments`, `remix`, `release`,
  `playbookSkills`, `sdkDocs`) called `/api/v1` REST and GraphQL `/query`.
- The gateway serves their `/api/v2` routes (pkg/v2/api/theses, playbooks,
  automation). R16: public methods and output stay; IDs become D16 strings.

## 2. Behavior

- B1: every call of these resources goes to `/api/v2` with a credential;
  none calls `/query`. The 0.x output is rebuilt from the v2 response.
- B2: Thesis writes send `request_id` as the Idempotency-Key.
- B3: `theses.update` reads the Thesis, sets a different visibility first
  (PATCH), unarchives an archived Thesis when `archived: false` (the
  unarchive gets its own key; the Update keeps `request_id`), then publishes
  the Update from the newest version. Omitted `medias` clear the media, as
  in 0.x (v2 would carry them over). `archived: true` is refused.
- B4: lists put the page token on the last row (`cursor`) and `""` on the
  others; `listOwn` adds `next_cursor`, which `playbooks mine --all` follows,
  so it continues past an empty page.
- B5: discovery (`playbooks.trending`, `getByIds`, `listByOwner`, `get`,
  every Skillhub read) uses `/api/v2` only when requests carry the API key;
  keyless clients and browser Playbooks (whose PBSV or viewer token is sent
  instead, and which `/api/v2` does not accept) keep `/api/v1`, which needs
  no credential.
- B6: `forYou.list` refuses `newerThan`; `forYou.theses` returns `listId: ''`
  and `scanLimited: false`.
- B7: `thesis list --ticker` resolves through `GET /api/v2/assets/by-symbol`;
  `--person`/`--user` through profile search with an exact handle match;
  `--person-name` keeps the unique-match rule with candidates on ambiguity.

## 3. Decisions

- D1: one mapping per wire object (`thesisPublication.ts`: `WireThesis`,
  `publicationSummary`, validators) shared by theses, Thesis reads and For
  You; malformed responses fail closed with `INVALID_RESPONSE`.
- D2: display stances stay 0.x: NONE reads UNKNOWN in `stance`
  (`entity_stances[].stance`, `entityStances`, mention stances); the REST
  shape keeps the full value in `direction`.
- D3: `author_ref` is the author's Profile ID (it was the uid), not the
  handle; `author_kind` maps USER to `alva_user`, PERSON to
  `public_source`.
- D4: the caller's username (feed paths, own-Playbook lookups) is read from
  `GET /api/v2/me` once per client; at integration this became
  `client.user._username()`, shared with deploy and trading.
- D5: types widen only where v2 sends values 0.x never did: candidate kinds
  COMMODITY/UNKNOWN, watchpoint origin `unknown`, For You action UNKNOWN and
  source MARKET_DATA/UNKNOWN.
- D6: null times that 0.x typed as numbers read 0 (entry `eventTimeMs`,
  source `publishedAtMs`), the backend's own value for "unset".

## 4. Implementation

- `src/resources/*.ts` above; `src/types.ts` (AlvaId on feed, release and
  comment types); `src/cli/dispatch.ts` (opaque ID flags for feed,
  automation lifecycle, release and comments; `mine --all`; help);
  `src/cli/agentHelp.ts` (help).
- Tests: `test/contentV2.ts` (wire fixtures and a route-keyed fetch),
  `test/resources/content.test.ts`, `theses.test.ts`, `thesisReads.test.ts`,
  `forYou.test.ts`, the thesis CLI tests, `cli.test.ts`, `companyNews.test.ts`.

## 5. Verification

- `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`
  (64 files, 1,448 tests), `npm run build`: pass (2026-11-19).
- 26 mutations, each caught by a failing test and restored: Thesis ID as
  `playbookId`; no page cursor on the last row; inverted visibility check;
  `request_id` on the unarchive; Update from the stale version; feed status
  default; `viewJson` as an object; `hasCredential` always true; no NONE
  mapping; cursor on every Signal entry; no archive key; omitted media sent
  as absent; For You version ID dropped; pin/unpin swapped; `archived`
  inverted; GENERATING rethrown; first profile instead of the exact handle;
  `archived: true` allowed; `newerThan` allowed; SDK partition page size;
  skill creator as handle; remix sources; `mine --all` on row cursors;
  `author_ref` as handle; PBSV clients on `/api/v2`.

## 6. Open points

- Keyless and PBSV discovery returns 0.x IDs (B5), so its IDs differ from
  an API-key client's. The resources that require auth (theses, For You,
  comments, release, feed) now meet `/api/v2` from a browser too (no CORS,
  PBSV is a guest); no such caller is known.
- v2 problems drop backend reasons (`THESIS_RETURN_LAST_LEG` in 0.x
  `details`); `thesis update --archived false` with new content publishes two
  Updates; profile search has no bio (taken from a listed Thesis's author).

## 7. Merge of 0.38.0-beta main (2026-11-24)

main gained the Thesis Signal setting (#219), weights and the allocation
(#221) and the following-feed author type (#220) on `/api/v1`. The merge keeps
the 1.0 resources and rebuilds the first two on the `/api/v2` routes that
alva-gateway#1512 adds (contract synced from it): `signalPreferences`,
`lastSignalPreferences`, `updateSignalPreferences` (PATCH, a merge patch, so
the CLI no longer reads before it writes), `NewThesis.signalPreferences`,
`assets[].weight` and the return's `allocation`. `requireKeptWeights` and the
v1 read validators are dropped: `/api/v2` refuses an unknown member, and the
types come from the contract. #220's `people follows theses` stays on
`/api/v1` and merged as is. `test/resources/thesis-weights.test.ts` and
`thesisSignalPreferences.test.ts` tested the v1 resources and are replaced by
cases in `test/resources/theses.test.ts` and `test/cli/theses.test.ts`.

Verification: `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm test` (76 files, 1,274 tests): pass.
