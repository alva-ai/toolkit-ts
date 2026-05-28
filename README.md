# @alva-ai/toolkit

Alva REST API SDK and CLI for Node.js and the browser.

- **CLI** — manage config, call any Alva API from your terminal
- **SDK** — typed TypeScript/JavaScript client for Node.js
- **Browser** — drop a `<script>` tag into plain HTML, no build step needed

## Install

```bash
npm install @alva-ai/toolkit
```

Or install globally for the CLI:

```bash
npm install -g @alva-ai/toolkit
```

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
alva arrays token ensure   # sign-if-needed; returns expires_at + tier
alva arrays token status   # returns exists + renewal_needed
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
alva skillhub list                                          # all skills
alva skillhub list --tag research                           # filter by tag
alva skillhub list --username alva                          # filter by author
alva skillhub tags                                          # all tags in use
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

## SDK Usage (Node.js)

```typescript
import { AlvaClient } from '@alva-ai/toolkit';

const client = new AlvaClient({ apiKey: 'alva_your_key_here' });

// List files
const entries = await client.fs.readdir({ path: '/' });

// Run code
const result = await client.run.execute({ code: 'return 1 + 1' });

// Manage cronjobs
const jobs = await client.deploy.list();

// Manage secrets
const secrets = await client.secrets.list();
```

## Browser Usage

Add the browser bundle via a CDN:

```html
<script src="https://unpkg.com/@alva-ai/toolkit/dist/browser.global.js"></script>
<script>
  const client = new AlvaToolkit.AlvaClient({
    viewer_token,
  });

  client.fs.readdir({ path: '/' }).then((entries) => {
    console.log(entries);
  });
</script>
```

> **Note:** The Alva API must have CORS headers configured for browser requests to work from your origin.

### Playbook Runtime UDFs

When the browser bundle is loaded inside an Alva playbook iframe, it also
installs `window.alva.udf`. The runtime reads the playbook-scoped viewer
token (`_pbsv`) from the iframe URL, removes only that sensitive query
parameter, accepts parent-pushed token refreshes, and uses PBSV headers for
UDF calls.

```html
<script src="https://unpkg.com/@alva-ai/toolkit/dist/browser.global.js"></script>
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
    console.error(err.status); // 404
    console.error(err.message); // 'File not found'
  }
}
```

## CLI Commands

```text
alva configure --api-key <key> [--base-url <url>] [--profile <name>]
alva whoami [--profile <name>]
alva auth login [--browser | --no-browser] [--profile <name>]
alva user me
alva fs <read|write|stat|readdir|mkdir|remove|rename|copy|symlink|readlink|chmod|grant|revoke>
alva run --code <code> [--entry-path <path>] [--working-dir <dir>] [--args <json>]
alva deploy <create|list|get|update|delete|pause|resume|runs|run-logs>
alva release <feed|playbook-draft|playbook>
alva playbooks <trending>
alva secrets <create|list|get|update|delete>
alva sdk <doc|partitions|partition-summary>
alva skillhub <list|tags|get|file> [<user>/<name>] [<file>] [--tag <t>] [--username <u>] [--json]
alva data-skills <list|summary|endpoint> [<skill>] [<file>] [--json]
alva comments <create|pin|unpin>
alva notification-preferences <list|enable-session-completed|disable-session-completed>
alva remix --child-username <u> --child-name <n> --parents <json>
alva screenshot --url <url> [--selector <s>] [--xpath <x>] --out <file>
alva trading <accounts|portfolio|orders|subscriptions|equity-history|risk-rules|subscribe|unsubscribe|execute|update-risk-rules>
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
