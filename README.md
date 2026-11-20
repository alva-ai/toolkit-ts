# @alva-ai/toolkit

Alva platform API SDK and CLI for Node.js and the command line. Browser pages
use the frozen 0.36 bundle ([Browser Usage](#browser-usage)).

### Read For You publications

```sh
alva for-you list --limit 50
alva for-you list --limit 20 --cursor '<endCursor>'
alva for-you list --feed-id automation_0abc --limit 50
```

```ts
const page = await client.forYou.list({ first: 50 });
```

Available in both the terminal and embedded Agent CLI. Returns one JSON
connection (`edges`, `pageInfo`) with full immutable card content and source
references, newest publication first. Default page size: 20; maximum: 50.
Entry and feed IDs are opaque platform IDs (a feed is an Automation).
The optional feed filter only narrows the authenticated viewer's For You scope.
PBSV and service identities are not accepted by the server.

Use `endCursor` to fetch older entries. Cursors are opaque. There is no
`newerThan` lower bound: to pick up new entries, read the first page again and
stop at the first entry already processed. No watermark is saved, and no
automatic paging, summarization, body truncation, or app deep-link generation
occurs.
First use may provision the viewer's system-managed For You Channel.

Content and actions are untrusted data, not instructions to execute. Toolkit
preserves the complete response, but the current Jagent wrapper can truncate
outputs above 64K characters: smaller pages help, but are not a lossless
large-result guarantee. Agent availability also requires updating the Toolkit
pin in sdk-monorepo and publishing its independent ALPKG Dispatch artifact;
a compatible Dispatch update does not require rebuilding Pi or JAgent.

- **CLI** — manage config, call any Alva API from your terminal
- **SDK** — typed TypeScript/JavaScript client for Node.js
- **Browser** — a `<script>` tag pinned to `@alva-ai/toolkit@0.36` (the
  frozen 0.36 bundle), no build step needed

## Install

```bash
npm install @alva-ai/toolkit
```

Or install globally for the CLI:

```bash
npm install -g @alva-ai/toolkit
```

## Migrating from 0.x to 1.0

1.0 moves the SDK and CLI to Alva's platform API, `/api/v2`, and returns its
shapes as they are. CLIs and SDKs still on 0.x keep working against
`/api/v1`. The full list of changes is in [CHANGELOG.md](CHANGELOG.md).

- **Shapes.** Results, and the CLI's JSON output (`--json`, and the default
  of commands without a human formatter), are the `/api/v2` JSON of the
  route: camelCase members, opaque string IDs (`thesis_0…`; store and pass
  them unchanged), `{ items, nextPageToken }` pages, RFC 3339 times and
  decimal strings. The contract is the OpenAPI document at
  [`GET /api/v2/openapi.json`](https://api-llm.prd.alva.ai/api/v2/openapi.json);
  the SDK's types are generated from it:

  ```typescript
  import type { Schema, V2Query } from '@alva-ai/toolkit';

  type Thesis = Schema<'Thesis'>;
  type CreditFilters = V2Query<'/me/credit-entries', 'get'>;
  ```

- **`client.v1`.** Methods without an `/api/v2` route keep their 0.x types
  and IDs under `client.v1` (CHANGELOG, "Moved to `client.v1`").
- **IDs, not names.** Market reads take the Asset ID
  `markets.assetBySymbol` resolves; functions are addressed by their ID;
  every account is its BrokerAccount ID, broker commands included
  (`--account-id`). Orders are an `OrderInstruction` placed with
  `trading.placeOrders` (CLI `trading execute --instruction`).
- **Errors.** `AlvaError` has `code`, `reason` (such as
  `IDEMPOTENCY_KEY_REUSED` or `INSUFFICIENT_CREDITS`), `type`, `status`,
  `message`, `requiredPermission`, `invalidParams` and `retryAfter`, read
  from the RFC 9457 problem. Branch on `reason` where it is set, else on
  `code`.
- **Permissions.** Each call needs one permission of the API key; a key
  without it gets `INSUFFICIENT_PERMISSION` with `requiredPermission`.
- **Writes and retries.** Every POST and PATCH sends one `Idempotency-Key`
  per call; pass `idempotencyKey` (or a method's request ID) to make your own
  retries safe. The SDK retries network errors, 409
  `IDEMPOTENCY_KEY_IN_USE`, 429 with a short `Retry-After`, and 502, 503 and
  504 with the same key, at most 3 attempts within 60 s.
- **Credentials and browsers.** `/api/v2` takes API keys. A client holding a
  `pbsvToken` or `viewer_token` gets `CREDENTIAL_REQUIRED` from `/api/v2`
  methods. 1.x has no browser build: pages load the 0.36 bundle, pinned
  ([Browser Usage](#browser-usage)).

## CLI Quick Start

Sign in with your Alva account (opens a browser, falls back to a paste-code
flow for SSH / containers / headless machines):

```bash
alva auth login
```

`auth login` runs an OAuth 2.0 Authorization Code + PKCE flow. The CLI prints
a URL you can open on any device; if a local default browser opens
automatically the listener finishes the login with no extra step, otherwise
copy the URL to another device, log in, and paste the code shown on the page
back into the terminal.

Headless / no-browser environments (SSH, containers, devcontainers, etc.)
are auto-detected; pass `--no-browser` to force the paste-code flow or
`--browser` to force the listener flow.

```bash
alva auth login --no-browser            # force paste-code flow
alva auth login --profile staging       # save under a named profile
alva auth login --auth-url https://stg.alva.xyz --base-url https://api-llm.stg.alva.ai  # point at stg
```

Or, if you already have an API key from [alva.ai/apikey](https://alva.ai/apikey),
skip the OAuth flow and store the key directly:

```bash
alva configure --api-key alva_your_key_here
```

Either path writes your credentials to `~/.config/alva/config.json`.

Now use any command:

```bash
# List your files
alva fs readdir --path /

# Run code
alva run --code 'return 1 + 1'

# Manage cronjobs
alva deploy list

# Manage secrets
alva secrets list
```

All output is JSON for easy piping:

```bash
alva fs readdir --path / | jq '.entries[].name'
```

### Arrays JWT

`alva configure` auto-provisions an Arrays JWT server-side (idempotent,
soft-fails on network errors — `configure` still exits 0). The token is
stored in your sandbox secrets as `ARRAYS_JWT`; the CLI never handles
the token string itself.

Inspect or re-run manually:

```bash
alva arrays token ensure   # sign-if-needed; returns expiresAt, tier, renewed
alva arrays token status   # returns exists, expiresAt, tier, renewalNeeded
```

`alva whoami` also reports current JWT status under `_meta.arrays_jwt`.

### Playbook Skills

Browse playbook templates (system + user-created) from the alva-gateway
public API. Skills are namespaced `<username>/<name>`.

Requires user auth — run `alva auth login` first.

The flow is progressive:

- `get` returns metadata + a file listing (path + size only — no content).
- `file` fetches one file's content at a time.

Bulk content is intentionally **not** exposed at the CLI/SDK layer; agents
should fetch the file listing first, then pull only the files they need.

```bash
alva skillhub list                                          # skill catalog
alva skillhub list --tag research                           # filter by tag
alva skillhub list --username alva                          # filter by author
alva skillhub tags                                          # skill tags
alva skillhub get alva/ai-digest                            # metadata + file listing
alva skillhub file alva/ai-digest README.md                 # one file's content
alva skillhub file alva/ai-digest references/api/example.md > out.md
```

By default output is pretty-printed for humans. Pass `--json` to get the
raw `{success, data}` envelope (e.g. for piping into `jq`).

### Playbook Discovery

Discover public playbooks with a compact, agent-friendly result shape. The
trending endpoint returns identifiers and ranking context, omitting
frontend-only preview fields.

```bash
alva playbooks trending --keyword scanner --tags macro,ai --sort recent --limit 5
alva playbooks trending --tag btc --cursor <cursor>
```

### Playbook Functions

Register creator-owned functions for released playbooks to invoke through
`window.alva.udf`. Function entry scripts must live at an absolute ALFS `.js`
path under the creator's home directory. Viewer credit allowance is managed
through the gateway REST session-user surface.

```bash
alva functions register --playbook-id playbook_0abc --function-name analyze --entry-script-path /alva/home/alice/playbooks/my-playbook/udf/analyze.js --params-schema-file ./schema.json --no-allow-charges
alva functions list --playbook-id playbook_0abc
alva functions delete --playbook-id playbook_0abc --function-name analyze
alva functions invoke --playbook-id playbook_0abc --function-name analyze --params '{"ticker":"AAPL"}'
alva functions allowance create --playbook-id playbook_0abc --amount 25
alva functions allowance get --playbook-id playbook_0abc
alva functions allowance list
alva functions allowance revoke --playbook-id playbook_0abc
```

### Data Skills

Browse the Arrays backend's data-skill documentation. These endpoints are
public — no Alva credentials required.

```bash
alva data-skills list                            # catalog of skills
alva data-skills summary <skill>                 # endpoints table for a skill
alva data-skills endpoint <skill> <file>         # full endpoint spec
```

### Config Resolution

The CLI resolves config in this order:

1. `--api-key` / `--base-url` flags
2. `ALVA_API_KEY` / `ALVA_ENDPOINT` environment variables
3. `~/.config/alva/config.json` (or `$XDG_CONFIG_HOME/alva/config.json`)

### Embedded CLI Dispatch

Embedded runtimes can reuse the CLI dispatcher directly without loading the
Node.js CLI shell or spawning the `alva` binary:

```typescript
import { AlvaClient } from '@alva-ai/toolkit';
import { dispatch, CliUsageError } from '@alva-ai/toolkit/dispatch';

const client = new AlvaClient({ apiKey: process.env.ALVA_API_KEY });
const result = await dispatch(client, ['account', 'whoami']);
```

The embedded dispatcher always exposes the purpose-built Alpi Alva command
catalog. It is independent from the packaged system `alva` CLI.
Authentication/setup, Arrays bootstrap, SDK documentation, duplicate aliases,
legacy top-level groupings, and `feedback submit` are not part of this catalog;
old Agent paths are rejected rather than aliased. Run the embedded `--help` for
the live tree. The independent system CLI continues to expose feedback.

The embedded surface is aligned with ALFS-native tools: local-file flags such as
`--local-file`, `--file`, `--params-schema-file`, and screenshot `--out` are
absent. Thesis commands likewise accept literal `--body` only: local files and
stdin have no verified embedded adapter. Use inline data or prepare content in ALFS before dispatching the
command; Agent screenshots return image content directly. `dispatch()` throws
`CliUsageError` for command-line usage errors and `AlvaError` for API errors.
Managed commands reject unknown flags before invoking an API. `trading broker`
is the explicit exception because argv after that nested prefix is forwarded
verbatim to the venue-native Broker contract.

Node.js command-line consumers should continue to use
`@alva-ai/toolkit/cli`, which adds config files, authentication, local files,
stdio, and Undici timeout configuration around its independent terminal
dispatcher. Both entries share the SDK and low-level command execution handlers,
not their catalogs, parsers, or help.

### Shipping embedded CLI changes to ALPI

Merging Toolkit or publishing its npm CLI does not update ALPI. Update
`sdks/toolkit-dispatch/toolkit` in sdk-monorepo, bump the Dispatch package version,
and release it there: merge to main for STG, then use the package release tag
for PRD. Publish Dispatch before any Slim Skill/Pi release that depends on it.

See [SDK release instructions](https://github.com/alva-ai/sdk-monorepo#package-scoped-production-releases).

## SDK Usage (Node.js)

```typescript
import { AlvaClient } from '@alva-ai/toolkit';

const client = new AlvaClient({ apiKey: 'alva_your_key_here' });

// List files
const entries = await client.fs.readdir({ path: '/' });

// Run code: the /api/v2 Run (status, returnValue as JSON text, logs, ...)
const run = await client.run.execute({ code: 'return 1 + 1' });

// Manage cronjobs
const jobs = await client.deploy.list();

// Manage secrets
const secrets = await client.secrets.list();
```

## Browser Usage

Browser pages use the 0.36 bundle. 1.x has no browser build: its
`dist/browser.global.js` is the published 0.36.0 bundle, unchanged, so pages
that load the unversioned URL keep their 0.36 behavior. Pin the version:

```html
<script src="https://unpkg.com/@alva-ai/toolkit@0.36/dist/browser.global.js"></script>
<script>
  const client = new AlvaToolkit.AlvaClient({
    viewer_token,
  });

  client.fs.readdir({ path: '/' }).then((entries) => {
    console.log(entries);
  });
</script>
```

> **Note:** The 0.36 bundle calls `/api/v1` and has the 0.x shapes and IDs.
> `/api/v2` accepts only API keys and sends no CORS headers.

### Playbook Runtime UDFs

When the browser bundle is loaded inside an Alva playbook iframe, it also
installs `window.alva.udf`. The runtime reads the playbook-scoped viewer
token from the private navigation response bootstrap, deletes that in-memory
bootstrap after consumption, accepts origin/source-checked parent refreshes,
and uses PBSV headers for UDF calls. URL credentials are ignored and scrubbed.
Non-owner viewers have read access only; invoking a UDF requires ownership.

Register creator-side functions first with `alva functions register`; viewer
HTML should call the browser runtime instead of hand-writing API fetches.

```html
<script src="https://unpkg.com/@alva-ai/toolkit@0.36/dist/browser.global.js"></script>
<script>
  (async () => {
    const response = await window.alva.udf.call('analyze', { ticker: 'AAPL' });
    console.log(response.result, response.credits_charged_consumer);
    const functions = await window.alva.udf.list();
  })();
</script>
```

For quick interactive controls, mount a runtime-managed UDF button. The button
is disabled until a PBSV token is present and emits DOM events for loading,
result, and error states.

```html
<div id="analyze"></div>
<script>
  const button = window.alva.udf.renderButton('#analyze', {
    functionName: 'analyze',
    params: { ticker: 'AAPL' },
    label: 'Run analysis',
  });

  button.addEventListener('alva:udf-button:result', (event) => {
    console.log(event.detail.result.result);
  });
</script>
```

For module users, the same runtime is available from the package root:

```typescript
import { installPlaybookRuntime, udf } from '@alva-ai/toolkit';

installPlaybookRuntime();
const response = await udf.call('analyze', { ticker: 'AAPL' });
```

## API Reference

### Resources

| Resource            | Methods                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client.user`       | `me()`                                                                                                                                                             |
| `client.fs`         | `read()`, `write()`, `rawWrite()`, `stat()`, `readdir()`, `mkdir()`, `remove()`, `rename()`, `copy()`, `symlink()`, `readlink()`, `chmod()`, `grant()`, `revoke()` |
| `client.run`        | `execute()`                                                                                                                                                        |
| `client.deploy`     | `create()`, `list()`, `get()`, `update()`, `delete()`, `pause()`, `resume()`                                                                                       |
| `client.release`    | `feed()`, `playbookDraft()`, `playbook()`                                                                                                                          |
| `client.playbooks`  | `trending()`                                                                                                                                                       |
| `client.theses`     | `create()`, `get()`, `update()`, `close()`, `delete()`, `rewrite()`                                                                                                |
| `client.functions`  | `register()`, `list()`, `delete()`, `invoke()`, `getAllowance()`, `listAllowances()`, `createAllowance()`, `revokeAllowance()`                                     |
| `client.secrets`    | `create()`, `list()`, `get()`, `update()`, `delete()`                                                                                                              |
| `client.sdk`        | `doc()`, `partitions()`, `partitionSummary()`                                                                                                                      |
| `client.comments`   | `create()`, `pin()`, `unpin()`                                                                                                                                     |
| `client.remix`      | `save()`                                                                                                                                                           |
| `client.screenshot` | `capture()`                                                                                                                                                        |

### Error Handling

```typescript
import { AlvaClient, AlvaError } from '@alva-ai/toolkit';

try {
  await client.fs.read({ path: '/nonexistent' });
} catch (err) {
  if (err instanceof AlvaError) {
    console.error(err.code); // 'NOT_FOUND'
    console.error(err.reason); // a finer public reason, when the problem has one
    console.error(err.status); // 404
    console.error(err.message); // the problem's detail
    console.error(err.type); // 'https://alva.ai/problems/not-found'
    console.error(err.requiredPermission); // on INSUFFICIENT_PERMISSION
    console.error(err.invalidParams); // on INVALID_ARGUMENT: [{ name, reason }]
    console.error(err.retryAfter); // seconds, on RATE_LIMITED and retryable failures
  }
}
```

## Managed Company News

Create a private, backend-managed News Feed without uploading a script or
deploying a cronjob yourself. One Feed covers the whole supplied ticker list:

```bash
alva company-news create --name my-company-news --tickers NVDA,AMD,AAPL
alva company-news create --name earnings-news --tickers NVDA,AMD --initial-lookback-hours 48 --page-size 30
```

Uses the configured Alva API key and `POST /api/v2/company-news-feeds`. The
backend owns the producer code and creates the Feed, its cronjob and processing
state. The response is the `CompanyNewsFeed`: the Feed's Automation ID as `id`
and its producer's Cronjob ID as `cronjobId`; newly created
producers are **paused**, and creation does not invoke a model or spend model
credits. Review the configuration, then explicitly start it from the terminal CLI
when ready (embedded dispatch does not expose Feed lifecycle commands):

```bash
alva feed resume --id <id>
```

Once resumed, model usage is charged to the authenticated creator. Company News
is pull-only; resume does not enable push notifications. No `--path`, script
upload, owner override or automatic-start flag is supported.

Names must be owner-local, 1–64 alphanumeric/hyphen characters starting with an
alphanumeric character, and not `news-lane`. Supply 1–1000 unique uppercase
tickers (maximum 20 characters each); the gateway refuses other values and
names the parameter. `--initial-lookback-hours` accepts 0–168
(default 24); `--page-size` accepts 0–100 (default 20). Zero selects the backend
default. Large universes are read incrementally rather than all in one wake.

Retry an unclear result with the **same name and configuration**; this returns
the existing resource without changing whether it is running. Different
configuration under the same name conflicts. This command does not update an
existing ticker universe.
Different names create independent Feeds, even when their tickers overlap.
For a single ticker, use `--tickers NVDA`; for many, pass the full comma-separated
list once. Incrementally appending tickers to the same Feed is not supported.

SDK equivalent:

```typescript
const { id, cronjobId } = await client.companyNews.create({
  name: 'my-company-news',
  tickers: ['NVDA', 'AMD'],
  initialLookbackHours: 24,
  batchSize: 20,
});
```

Requires the companion Gateway adapter and backend Company News deployment,
migration. An unavailable backend fails explicitly;
the CLI does not fall back to script deployment. Terminal and embedded dispatch
both support creation, but publishing this npm CLI alone does not update ALPI;
follow the embedded CLI release instructions below.

## CLI Commands

```text
alva configure --api-key <key> [--base-url <url>] [--profile <name>]
alva whoami [--profile <name>]
alva auth login [--browser | --no-browser] [--profile <name>]
alva user me
alva fs <read|write|stat|readdir|mkdir|remove|rename|copy|symlink|readlink|chmod|grant|revoke>
alva run --code <code> [--entry-path <path>] [--working-dir <dir>] [--args <json> | --args-stdin] [--timeout-ms <ms>]
alva deploy <create|list|get|update|delete|pause|resume|runs|run-logs>
alva release <feed|playbook-draft|playbook>
alva playbooks <trending>
alva thesis <list|related|create|get|signals|set-visibility|update|rewrite>
alva thesis version get --id <thesis-id> --author-version-id <version-id>
alva thesis list --person <slug>       # or --person-name <name> / --user <username>
alva thesis list --ticker NVDA         # or --entity-id <id>; --cursor <nextCursor>
alva thesis related --id <thesis-id>
alva thesis watchpoints --id <thesis-id>  # list the Thesis's current watchpoints: [{label, text, origin}]
alva functions <register|list|delete|invoke|allowance>
alva secrets <create|list|get|update|delete>
alva sdk <doc|partitions|partition-summary>
alva skillhub <list|tags|get|file> [<user>/<name>] [<file>] [--tag <t>] [--username <u>] [--json]
alva data-skills <list|summary|endpoint> [<skill>] [<file>] [--json]
alva comments <create|pin|unpin>
alva notification-preferences <list|enable-session-completed|disable-session-completed>
alva remix --child-username <u> --child-name <n> --parents <json>
alva screenshot --url <url> [--selector <s>] [--xpath <x>] --out <file>
alva markets narrative --ticker <symbol>
alva markets earnings --ticker <symbol> [--event <latest-completed|next-confirmed> | --fiscal-year <year> --fiscal-quarter <Q1|Q2|Q3|Q4>]
alva trading-pairs search --symbol <ticker> [--market <market>] [--instrument-type <type>] [--underlying-type <type>] [--quote <quote>] [--json]
alva trading-pairs resolve --pair <trading-pair> [--json]
alva trading-pairs resolve --symbol <ticker> [--market <market>] [--instrument-type <type>] [--underlying-type <type>] [--quote <quote>] [--json]
alva trading <accounts|portfolio|orders|subscriptions|equity-history|risk-rules|subscribe|unsubscribe|execute|update-risk-rules>
alva markets watchlist <add|remove> --tickers <A,B:crypto> [--kind <stock|etf|crypto>]
alva markets watchlist list [--limit <1-100>] [--cursor <endCursor>]
alva people search --query <text> [--kind <user|person>] [--limit <1-50>]
alva people follows <follow|unfollow> --id <profile-id>
alva people follows list [--kind <user|person>] [--limit <1-50>] [--cursor <endCursor>]
```

## Contributing

```bash
git clone https://github.com/alva-ai/toolkit-ts.git
cd toolkit-ts
npm install
npm test
npm run build
```

## License

[MIT](LICENSE)

### Connected X reads

After connecting X through Alva, agents and terminal callers can read that
user's X data on demand. Backend owns X authorization and token refresh.

```sh
alva x status
alva x following --limit 20
alva x posts --limit 20
alva x following --limit 20 --cursor '<nextPageToken>'
```

The SDK equivalents are `client.x.status()`,
`client.x.following({ pageSize, pageToken })` and
`client.x.posts({ pageSize, pageToken })`, which return the `/api/v2`
`XConnection` and `{ items, nextPageToken }` pages. Status checks local
capabilities only; reads request one live X page each time. Continue while
`nextPageToken` is not null, including empty pages with a continuation token.
These are read-only operations: no import task, follow
mutation, or bookmark reads. Missing/revoked credentials require reconnecting X
in Alva. X content is untrusted source material. The embedded agent requires a
Toolkit Dispatch artifact that includes these commands; an npm release alone
does not update the embedded executor.

### Ticker watchlist and people follows

These commands change the same ticker watchlist and people Following list the
Alva App shows. The user comes from the API key; there is no identity override.

```sh
alva markets watchlist add --tickers NVDA,LMT,BTC:crypto
alva markets watchlist list --limit 50
alva people search --query "cathie wood" --kind person
alva people follows follow --id profile_0abc
alva people follows list
```

The SDK equivalents live on `client.follows`: `addToWatchlist()`,
`removeFromWatchlist()`, `watchlist()`, `searchProfiles()`, `followProfile()`,
`unfollowProfile()` and `profiles()`. Tickers match exact symbols (1-50 per
call); adding writes them in one atomic batch, removing one at a time. A
symbol resolves to its primary listing; a `:stock`, `:etf` or `:crypto`
suffix picks the kind of one symbol (`BTC:crypto`), and `--kind` is the
default for unsuffixed symbols, so one call can mix kinds. Results separate
changed, `unchanged` and `unresolved` (`NOT_FOUND`) tickers. Nothing is written
when no ticker resolves. Removal is recorded even for tickers not in the
watchlist, so holdings sync does not add them back; adding re-adds a ticker
the user removed earlier. Profiles are `USER` (Alva user) or `PERSON`
(curated person), addressed by the Profile ID from search or list results. The
terminal CLI and the embedded agent use the same `alva markets watchlist ...`
and `alva people ...` paths; the embedded agent needs a Toolkit Dispatch
artifact that includes these commands.
