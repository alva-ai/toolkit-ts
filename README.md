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

Configure your API key (get one at [alva.ai](https://alva.ai)):

```bash
alva configure --api-key alva_your_key_here
```

This writes your credentials to `~/.config/alva/config.json`.

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
    apiKey: 'alva_your_key_here',
  });

  client.fs.readdir({ path: '/' }).then((entries) => {
    console.log(entries);
  });
</script>
```

> **Note:** The Alva API must have CORS headers configured for browser requests to work from your origin.

## API Reference

### Resources

| Resource            | Methods                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client.user`       | `me()`                                                                                                                                                             |
| `client.fs`         | `read()`, `write()`, `rawWrite()`, `stat()`, `readdir()`, `mkdir()`, `remove()`, `rename()`, `copy()`, `symlink()`, `readlink()`, `chmod()`, `grant()`, `revoke()` |
| `client.run`        | `execute()`                                                                                                                                                        |
| `client.deploy`     | `create()`, `list()`, `get()`, `update()`, `delete()`, `pause()`, `resume()`                                                                                       |
| `client.release`    | `feed()`, `playbookDraft()`, `playbook()`                                                                                                                          |
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

```
alva configure --api-key <key> [--base-url <url>]
alva user me
alva fs <read|write|stat|readdir|mkdir|remove|rename|copy|symlink|readlink|chmod|grant|revoke>
alva run --code <code> [--entry-path <path>] [--working-dir <dir>] [--args <json>]
alva deploy <create|list|get|update|delete|pause|resume>
alva release <feed|playbook-draft|playbook>
alva secrets <create|list|get|update|delete>
alva sdk <doc|partitions|partition-summary>
alva comments <create|pin|unpin>
alva remix --child-username <u> --child-name <n> --parents <json>
alva screenshot --url <url> [--selector <s>] [--xpath <x>] --out <file>
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
