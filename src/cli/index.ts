import { AlvaClient } from '../client.js';
import { AlvaError, CliUsageError } from '../error.js';
import { loadConfig, writeConfig } from './config.js';
import { handleAuthLogin } from './auth.js';
import { runPostConfigureHooks } from './postConfigureHooks.js';
import {
  formatSkillsList,
  formatSkillSummary,
  formatSkillEndpoint,
} from './skillsFormat.js';
import * as fs from 'fs';
import * as os from 'os';
import * as fsPromises from 'fs/promises';

declare const __VERSION__: string;
export const CLI_VERSION: string =
  typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';

/**
 * Returns true if version `a` is strictly older than version `b`.
 * Compares major.minor.patch as integers. Returns false on malformed input.
 */
export function isVersionOlderThan(a: string, b: string): boolean {
  const parse = (v: string): number[] | null => {
    if (!v) return null;
    const parts = v.split('.').map(Number);
    if (parts.some(isNaN)) return null;
    while (parts.length < 3) parts.push(0);
    return parts;
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return false;
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return true;
    if (pa[i] > pb[i]) return false;
  }
  return false;
}

const HELP_TEXT = `Usage: alva <command> [options]

Commands:
  configure   Save API key and endpoint to a named profile
  whoami      Verify credentials and show current identity
  user        User profile operations (me)
  fs          Filesystem operations (read, write, stat, readdir, mkdir, remove, rename, copy, symlink, readlink, chmod, grant, revoke)
  run         Execute code in the Alva runtime
  deploy      Cronjob management (create, list, get, update, delete, pause, resume, runs, run-logs)
  release     Feed and playbook releases (feed, playbook-draft, playbook)
  secrets     Secret management (create, list, get, update, delete)
  sdk         SDK documentation (doc, partitions, partition-summary)
  skills      Data-skill documentation from the Arrays backend (list, summary, endpoint)
  templates   Playbook templates discovery (list, categories, get, files)
  comments    Playbook comments (create, pin, unpin)
  push-subscriptions  Personal push opt-in (subscribe-playbook, unsubscribe-playbook, subscribe-feed, unsubscribe-feed, list)
  channel     Channel group operations (group-subscriptions context, list, subscribe, unsubscribe)
  remix       Save playbook remix lineage
  trading     Trading operations (accounts, portfolio, orders, subscriptions, equity-history, risk-rules, subscribe, unsubscribe, execute, update-risk-rules)
  auth        Authentication (login)
  screenshot  Capture a web screenshot as PNG
  arrays      Arrays backend operations (token ensure, token status)

Global options:
  --api-key <key>        API key (overrides env and config file)
  --base-url <url>       API base URL (overrides env and config file)
  --profile <name>       Named profile to use (default: "default")
  --arrays-endpoint <url>  Arrays backend URL (or ARRAYS_ENDPOINT env; default: https://data-tools.prd.space.id)
  -v, --version        Show CLI version
  --help               Show help (use 'alva <command> --help' for command details)

Config resolution: --api-key flag > ALVA_API_KEY env > profile in ~/.config/alva/config.json
Profile resolution: --profile flag > ALVA_PROFILE env > "default"

Quick start:
  npm install -g @alva-ai/toolkit
  alva configure --api-key alva_your_key_here
  alva whoami`;

const COMMAND_HELP: Record<string, string> = {
  configure: `Usage: alva configure --api-key <key> [--base-url <url>] [--profile <name>]

Save API credentials to ~/.config/alva/config.json (mode 0600).
After configuring, subsequent commands use the saved key automatically.
Multiple profiles allow switching between environments (production, staging, etc.).
Also auto-runs 'alva arrays token ensure' to provision the server-side Arrays JWT
(soft-fail: a network/auth failure prints a stderr warning but exit stays 0).

Required:
  --api-key <key>      Your Alva API key (starts with "alva_")

Optional:
  --base-url <url>     API base URL (default: https://api-llm.prd.alva.ai)
  --profile <name>     Profile name to save under (default: "default")

Config file format:
  {
    "profiles": {
      "default": { "apiKey": "alva_...", "baseUrl": "https://api-llm.prd.alva.ai" },
      "staging": { "apiKey": "alva_...", "baseUrl": "https://api-llm.stg.alva.ai" }
    }
  }

Examples:
  alva configure --api-key alva_abc123
  alva configure --api-key alva_abc123 --base-url http://localhost:8080
  alva configure --profile staging --api-key alva_stg_key --base-url https://api-llm.stg.alva.ai
  alva --profile staging whoami`,

  auth: `Usage: alva auth <subcommand>

Subcommands:
  login       Open browser to authenticate and save credentials

Examples:
  alva auth login
  alva auth login --profile staging`,

  whoami: `Usage: alva whoami [--profile <name>]

Verify that your credentials are valid by calling the Alva API. Shows your
username, subscription tier, and which profile/endpoint is being used.
Use this after 'alva configure' to confirm everything works.

Output also includes _meta.arrays_jwt (exists, expires_at, renewal_needed,
tier) when the backend is reachable; the field is omitted on RPC failure.

Examples:
  alva whoami
  alva --profile staging whoami`,

  user: `Usage: alva user <subcommand>

Subcommands:
  me    Get the authenticated user's profile

Response fields:
  id                  User ID
  username            Username (used in ALFS paths and playbook URLs)
  subscription_tier   "free" or "pro" — determines release flow and feature gates
  telegram_username   Telegram username if connected, null otherwise

Examples:
  alva user me`,

  fs: `Usage: alva fs <subcommand> [options]

Subcommands:
  read       Read a file or time series data
  write      Write content to a file (use --data for inline, --file for upload)
  stat       Get file metadata (name, size, mode, mod_time, is_dir)
  readdir    List directory contents
  mkdir      Create a directory (recursive by default)
  remove     Delete a file or directory
  rename     Move/rename a file
  copy       Copy a file
  symlink    Create a symbolic link
  readlink   Read a symlink target
  chmod      Change file permissions (mode is octal, e.g. 755)
  grant      Grant access permission to a user or group
  revoke     Revoke access permission

Subcommand flags:
  read       --path (required), [--offset <n>], [--size <n>]
  write      --path (required), --data <text> OR --file <local-path> (one required),
             [--mkdir-parents | --no-mkdir-parents]
  stat       --path (required)
  readdir    --path (required), [--recursive | --no-recursive]
  mkdir      --path (required)
  remove     --path (required), [--recursive | --no-recursive]
  rename     --old-path (required), --new-path (required)
  copy       --src-path (required), --dst-path (required)
  symlink    --target-path (required), --link-path (required)
  readlink   --path (required)
  chmod      --path (required), --mode <octal> (required)
  grant      --path (required), --subject <s> (required), --permission <p> (required)
  revoke     --path (required), --subject <s> (required), --permission <p> (required)

Path conventions:
  ~/...                  Home-relative path (expands to /alva/home/<username>/...)
  /alva/home/alice/...   Absolute path (required for public/unauthenticated reads)
  Quote tilde paths to prevent shell expansion: --path "~/data" (not --path ~/data).

Time series reads:
  Paths under feed data directories support virtual suffixes:
    @last/{n}            Last N data points (chronological order)
    @range/{start}..{end}  Between timestamps (RFC 3339 or Unix ms)
    @range/{duration}    Recent data within duration (e.g. 7d, 1h)
    @count               Data point count
    @now                 Latest single data point

Grant/revoke subjects:
  special:user:*         Public (anyone, including unauthenticated)
  special:user:+         Any authenticated user
  user:<id>              Specific user by ID

Examples:
  alva fs readdir --path "~/"
  alva fs readdir --path "~/data" --recursive
  alva fs read --path "~/data/prices.json"
  alva fs read --path "~/feeds/btc-ema/v1/data/metrics/prices/@last/100"
  alva fs read --path /alva/home/alice/feeds/btc-ema/v1/data/metrics/prices/@last/10
  alva fs write --path "~/hello.txt" --data "Hello, world!"
  alva fs write --path "~/feeds/my-feed/v1/src/index.js" --file ./local-script.js --mkdir-parents
  alva fs stat --path "~/hello.txt"
  alva fs mkdir --path "~/feeds/my-feed/v1/src"
  alva fs remove --path "~/old-folder" --recursive
  alva fs rename --old-path "~/a.txt" --new-path "~/b.txt"
  alva fs copy --src-path "~/a.txt" --dst-path "~/b.txt"
  alva fs chmod --path "~/script.js" --mode 755
  alva fs grant --path "~/feeds/btc-ema" --subject "special:user:*" --permission read
  alva fs revoke --path "~/feeds/btc-ema" --subject "special:user:*" --permission read
  alva fs symlink --target-path "~/real-file.txt" --link-path "~/my-link.txt"
  alva fs readlink --path "~/my-link.txt"`,

  run: `Usage: alva run [options]

Execute JavaScript code in the Alva V8 runtime. Provide either inline code
or a path to a script file on ALFS. Scripts have access to 250+ financial
data SDKs, ALFS, HTTP networking, and the Feed SDK.

Options:
  --code <code>          Inline JavaScript code to execute
  --local-file <path>    Path to a local file whose contents are sent as code
  --entry-path <path>    Path to a script file on ALFS (home-relative)
  --working-dir <dir>    Working directory for require() (inline code only)
  --args <json>          JSON object passed to require("env").args

At least one of --code, --local-file, or --entry-path is required.
These three options are mutually exclusive.

Response fields:
  result    JSON-encoded return value of the script
  logs      Captured stderr output
  status    "completed" or "failed"
  error     Error message (when status is "failed")

Available runtime modules:
  require("alfs")            Cloud filesystem (absolute paths only)
  require("env")             userId, username, args from request
  require("net/http")        fetch(url, init) for HTTP requests
  require("secret-manager")  Read user-scoped third-party secrets
  require("@alva/feed")      Feed SDK for data pipelines
  require("@alva/algorithm") 50+ technical indicators
  require("@alva/adk")       Agent SDK for LLM tool calling
  require("@arrays/...")     250+ financial data SDKs

Constraints:
  No top-level await — wrap in (async () => { ... })();
  No Node.js builtins (fs, path, http) — use alfs, net/http instead
  2 GB heap limit per execution

Examples:
  alva run --code "1 + 2 + 3;"
  alva run --code "JSON.stringify(require('env').args);" --args '{"symbol":"BTC"}'
  alva run --entry-path "~/feeds/my-feed/v1/src/index.js"
  alva run --entry-path "~/tasks/analyze/src/index.js" --args '{"symbol":"NVDA","limit":50}'
  alva run --local-file ./my-script.js --args '{"symbol":"BTC"}'`,

  deploy: `Usage: alva deploy <subcommand> [options]

Manage scheduled cronjobs that run your scripts on a cron schedule.
Max 20 cronjobs per user. Min interval: 1 minute.

Subcommands:
  create     Create a new cronjob
  list       List all cronjobs (supports cursor-based pagination)
  get        Get a single cronjob by ID
  update     Update a cronjob (partial update — only include changed fields)
  delete     Delete a cronjob
  pause      Pause a running cronjob
  resume     Resume a paused cronjob
  trigger    Fire the cronjob once, immediately, bypassing the schedule
             (returns workflow_run_id; poll 'runs' to verify completion)
  runs       List runs for a cronjob (cursor-paginated)
  run-logs   Get stdout/stderr logs for a single cronjob run

Create flags:
  --name <name>          Cronjob name (required, 1-63 lowercase alphanumeric/hyphens)
  --path <path>          Path to script on ALFS (required, must exist)
  --cron <expression>    Cron expression (required, e.g. "0 */4 * * *")
  --args <json>          JSON object passed to require("env").args
  --push-notify          Enable Telegram push notifications on completion
  --no-push-notify       Disable push notifications

List flags:
  --limit <n>            Max results per page (default: 20)
  --cursor <cursor>      Pagination cursor from previous response

Get/Update/Delete/Pause/Resume/Trigger flags:
  --id <id>              Cronjob ID (required)

Runs flags:
  --id <id>              Cronjob ID (required)
  --first <n>            Max results per page
  --cursor <cursor>      Pagination cursor from previous response

Run-logs flags:
  --id <id>              Cronjob ID (required)
  --run-id <id>          Run ID (required)

Name format: 1-63 lowercase alphanumeric or hyphens, no leading/trailing hyphens.
  Valid:   btc-ema-update, my-strategy-1
  Invalid: BTC EMA, -my-job-, my_job

Recommended cron schedules:
  "0 */4 * * *"    Every 4 hours (stock OHLCV, crypto technicals)
  "0 8 * * *"      Daily at 8am (fundamentals, insider trades, earnings)
  "*/5 * * * *"    Every 5 minutes (high-frequency alerts)
  "0 0 * * *"      Daily at midnight (end-of-day summaries)

Examples:
  alva deploy create --name btc-ema --path "~/feeds/btc-ema/v1/src/index.js" --cron "0 */4 * * *"
  alva deploy create --name alert --path "~/feeds/alert/v1/src/index.js" --cron "*/5 * * * *" --push-notify --args '{"threshold":100}'
  alva deploy list
  alva deploy list --limit 10
  alva deploy get --id 42
  alva deploy update --id 42 --cron "0 */2 * * *" --no-push-notify
  alva deploy pause --id 42
  alva deploy resume --id 42
  alva deploy delete --id 42
  alva deploy runs --id 42
  alva deploy runs --id 42 --first 10
  alva deploy run-logs --id 42 --run-id 123

Build-time verify (fire once, then poll until your run completes):
  WF=$(alva deploy trigger --id 42 | jq -r .workflow_run_id)
  while ! ROW=$(alva deploy runs --id 42 --first 5 \\
                 | jq -e ".runs[] | select(.workflow_run_id==\\"$WF\\")"); do
    sleep 5
  done
  STATUS=$(echo "$ROW" | jq -r .status)
  [ "$STATUS" = completed ] || alva deploy run-logs --id 42 \\
                                  --run-id "$(echo "$ROW" | jq -r .id)"`,

  release: `Usage: alva release <subcommand> [options]

Publish feeds and playbooks to the Alva platform. The typical workflow:
  1. Deploy cronjob (alva deploy create)
  2. Register feed (alva release feed)
  3. Create playbook draft (alva release playbook-draft)
  4. Write HTML to ALFS (alva fs write --path ~/playbooks/{name}/index.html)
  5. Write README to ALFS (alva fs write --path ~/playbooks/{name}/README.md)
  6. Release playbook (alva release playbook --readme-url "{name}/README.md")

Subcommands:
  feed              Register a feed after deploying its cronjob
  playbook-draft    Create a playbook draft (preview before publishing)
  playbook          Publish a playbook (public for free users, choice for pro)

Feed flags:
  --name <name>          Feed name, unique per user (required)
  --version <version>    Semantic version, e.g. "1.0.0" (required)
  --cronjob-id <id>      ID of the backing cronjob (required)
  --view-json <json>     View configuration JSON
  --description <text>   Feed description
  --changelog <text>     Per-major changelog summary

Playbook-draft flags:
  --name <name>              URL-safe playbook name, unique per user (required)
  --display-name <name>      Human-readable title, max 40 chars (required)
  --feeds <json>             JSON array of {feed_id, feed_major?} (required)
  --description <text>       Playbook description
  --trading-symbols <json>   JSON array of tickers, e.g. '["BTC","ETH"]' (max 50)
  --template-id <id>         Source-template reference "username/name", e.g.
                             "alva/screener". Persisted set-once on first draft.

Playbook flags:
  --name <name>          Playbook name, must already exist as draft (required)
  --version <version>    Semantic version, e.g. "v1.0.0" (required)
  --feeds <json>         JSON array of {feed_id, feed_major?} (required)
  --changelog <text>     Release changelog (required)
  --readme-url <url>     Owner-attested README location (required). Must be
                         either "<name>/README.md" (relative) or
                         "/alva/home/<username>/playbooks/<name>/README.md"
                         (absolute). The README must already be written to
                         ALFS at that path before publish.

Display name conventions:
  Format: [subject/theme] [analysis angle/strategy logic]
  Max 40 characters. Avoid "My", "Test", or generic-only titles.
  Good: "BTC Trend Dashboard", "NVDA Insider Activity Tracker"
  Bad:  "My Dashboard", "Test V2", "Stock Dashboard"

Examples:
  alva release feed --name btc-ema --version 1.0.0 --cronjob-id 42
  alva release feed --name nvda-insiders --version 1.0.0 --cronjob-id 43 --description "NVDA insider trading activity"
  alva release playbook-draft --name btc-dashboard --display-name "BTC Trend Dashboard" --feeds '[{"feed_id":100}]' --trading-symbols '["BTC"]'
  alva release playbook-draft --name btc-dashboard --display-name "BTC Trend Dashboard" --feeds '[{"feed_id":100}]' --template-id alva/screener
  alva release playbook --name btc-dashboard --version v1.0.0 --feeds '[{"feed_id":100}]' --changelog "Initial release" --readme-url "btc-dashboard/README.md"`,

  secrets: `Usage: alva secrets <subcommand> [options]

Manage encrypted secrets for use in Alva scripts. Secrets are stored
encrypted at rest and accessible via require("secret-manager") in the runtime.

For sensitive secrets (API keys, tokens), prefer the web UI at https://alva.ai/apikey.
Use the CLI for agent-managed CRUD operations.

Subcommands:
  create     Create a new secret (fails if name already exists)
  list       List all secrets (metadata only: name, keyPrefix, timestamps)
  get        Get a secret's plaintext value
  update     Update a secret's value (fails if name doesn't exist)
  delete     Delete a secret (fails if name doesn't exist)

Flags:
  --name <name>      Secret name (required for create, get, update, delete)
  --value <value>    Secret value (required for create, update)

Runtime usage in scripts:
  const secret = require("secret-manager");
  const key = secret.loadPlaintext("OPENAI_API_KEY");
  // Returns string if found, null if missing

Examples:
  alva secrets create --name OPENAI_KEY --value sk-abc123
  alva secrets list
  alva secrets get --name OPENAI_KEY
  alva secrets update --name OPENAI_KEY --value sk-new456
  alva secrets delete --name OPENAI_KEY`,

  sdk: `Usage: alva sdk <subcommand> [options]

Browse Alva's 250+ financial data SDKs. Use the two-step discovery flow:
  1. List partitions to find the right category
  2. Get partition summary to see available modules
  3. Get full documentation for a specific module

Subcommands:
  doc                 Get documentation for a specific SDK module
  partitions          List all available data partitions
  partition-summary   Get a summary of modules in a partition

Flags:
  --name <module>        Module name for 'doc' (required)
  --partition <name>     Partition name for 'partition-summary' (required)

Key partitions:
  feed_widgets                             Per-handle/channel rolling subscriptions
  unified_search                           Web search and URL scraping tools (X/Grok, Google, Brave, serper, decodo)
  technical_indicator_calculation_helpers  50+ pure calculators (RSI, MACD, Bollinger)

Examples:
  alva sdk partitions
  alva sdk partition-summary --partition feed_widgets
  alva sdk doc --name "@arrays/data/widget-scrap/twitter:v1.0.0"
  alva sdk doc --name "@arrays/data/search/search-grok-x:v1.0.0"`,

  templates: `Usage: alva templates <subcommand> [options]

Discover playbook templates registered in the Alva backend. Templates
are namespaced by (username, name): system-seeded templates use
username='alva' (e.g. alva/ai-digest), user-created templates use the
creator's username. All four routes are public read-only proxies of
the backend TemplatesService.

Subcommands:
  list         List template summaries (filter by category and/or username)
  categories   Distinct sorted set of categories used across all templates
  get          Get one template's metadata + file listing (path + size_bytes, no content)
  files        Get one template's full file content (for materialization)

Flags:
  --category <name>      (list) Filter by category, e.g. "research"
  --username <user>      (list) Filter by owner username, e.g. "alva"
  --username <user>      (get/files) Required: template owner username
  --name <name>          (get/files) Required: template name

Output: JSON to stdout. No filesystem side effects — pipe through jq or
your own materializer if you need files on disk.

Examples:
  alva templates list
  alva templates list --category research
  alva templates list --username alva
  alva templates list --category push --username alva
  alva templates categories
  alva templates get --username alva --name ai-digest
  alva templates files --username alva --name ai-digest`,

  skills: `Usage: alva skills <subcommand> [options]

Browse the Arrays backend's data-skill documentation. These endpoints are
public — no Alva credentials required.

Subcommands:
  list       List all available data skills
  summary    Get the endpoints table for a skill, plus local tier metadata (requires --name)
  endpoint   Get full documentation and local tier metadata for a specific endpoint (requires --name and --file)

Flags:
  --name <name>      Skill name (required for summary and endpoint)
  --file <file>      Endpoint file name from the "File" column of 'skills summary' (required for endpoint)
  --json             Emit raw JSON instead of the readable rendering (for scripting / jq)

Output: by default, summary/endpoint print the skill's markdown content directly,
and list prints a name → description summary. Pass --json to get the raw JSON
shape (same as before this CLI version) for piping into jq or other tools.

Global override:
  --arrays-endpoint <url>   Arrays backend URL (or ARRAYS_ENDPOINT env)
                            Default: https://data-tools.prd.space.id

Examples:
  alva skills list
  alva skills list --json
  alva skills summary --name <skill>
  alva skills endpoint --name <skill> --file <endpoint-file>
  alva skills summary --name <skill> --json | jq '.content'`,

  comments: `Usage: alva comments <subcommand> [options]

Manage comments on Alva playbooks. Supports top-level comments and threaded
replies. One comment per playbook can be pinned (pinning a new one unpins
the previous).

Subcommands:
  create     Post a comment on a playbook (or reply to an existing comment)
  pin        Pin a top-level comment (owner/admin only)
  unpin      Unpin a comment (owner/admin only)

Create flags:
  --username <user>      Playbook owner's username (required)
  --name <name>          Playbook name (required)
  --content <text>       Comment content (required)
  --parent-id <id>       Parent comment ID (for threaded replies, omit for top-level)

Pin/Unpin flags:
  --comment-id <id>      Comment ID (required)

Examples:
  alva comments create --username alice --name btc-dashboard --content "Great analysis!"
  alva comments create --username alice --name btc-dashboard --content "Thanks!" --parent-id 5
  alva comments pin --comment-id 12
  alva comments unpin --comment-id 12`,

  'push-subscriptions': `Usage: alva push-subscriptions <subcommand> [options]

Personal opt-in for DM/web push notifications. Independent of social
follow: subscribing does not start following, unsubscribing does not
unfollow. Following a playbook elsewhere will compound-subscribe
automatically.

Subcommands:
  subscribe-playbook     Opt into push for a playbook (any of its feeds)
  unsubscribe-playbook   Opt out of push for a playbook (soft-disable)
  subscribe-feed         Opt into push for a single feed
  unsubscribe-feed       Opt out of push for a single feed (soft-disable)
  list                   List the caller's push subscriptions

Subscribe/unsubscribe flags (playbook + feed):
  --username <user>      Owner's username (required)
  --name <name>          URL-safe playbook or feed name (required)

List flags:
  --include-history      Also return rows previously unsubscribed (default: false)

Examples:
  alva push-subscriptions subscribe-playbook --username alice --name btc-dashboard
  alva push-subscriptions subscribe-feed     --username alice --name btc-ema-cross
  alva push-subscriptions unsubscribe-feed   --username alice --name btc-ema-cross
  alva push-subscriptions list --include-history`,

  channel: `Usage: alva channel group-subscriptions <subcommand> [options]

Manage push notifications delivered into the external group chat attached
to a channel session. The group can subscribe to public feeds and playbooks.
Subscribe/unsubscribe are idempotent no-ops unless the authenticated caller
is that group's Alva admin.

Subcommands:
  context       Show group admin status and current subscriptions
  list          List active subscriptions for the group
  subscribe     Subscribe the group to a public feed or playbook
  unsubscribe   Unsubscribe the group from a feed or playbook

Common flags:
  --session-id <id>      Channel session id for the group (required)

Subscribe/unsubscribe flags:
  --target-type <type>   feed or playbook (required)
  --target-id <id>       Numeric feed_id or playbook_id (required)

Examples:
  alva channel group-subscriptions context --session-id 123
  alva channel group-subscriptions list --session-id 123
  alva channel group-subscriptions subscribe --session-id 123 --target-type feed --target-id 8169
  alva channel group-subscriptions unsubscribe --session-id 123 --target-type playbook --target-id 42`,

  remix: `Usage: alva remix --child-username <u> --child-name <n> --parents <json>

Record remix lineage when creating a playbook based on existing playbooks.
Call this after releasing a remixed playbook to establish the parent-child
relationship in the database.

Required:
  --child-username <username>   Your username (the remixer)
  --child-name <name>           Your new playbook name
  --parents <json>              JSON array of source playbooks: [{"username":"...", "name":"..."}]

Examples:
  alva remix --child-username bob --child-name my-btc --parents '[{"username":"alice","name":"btc-signals"}]'`,

  screenshot: `Usage: alva screenshot --url <url> --out <file> [--selector <css>] [--xpath <xpath>] [--compress] [--compress-quality <n>] [--compress-max-width <px>]

Capture a screenshot of an Alva page and save it as PNG. Useful for verifying
playbook rendering before release.

Required:
  --url <url>                URL or path to capture (e.g. /playbook/alice/dashboard)
  --out <file>               Local file path to write the PNG output

Optional:
  --selector <css>           CSS selector to capture a specific element
  --xpath <xpath>            XPath selector to capture a specific element
  --compress                 Re-encode the PNG to reduce file size
  --compress-quality <n>     Compression quality 1-100 (gateway default applies if omitted)
  --compress-max-width <px>  Downscale to at most this width in pixels

Examples:
  alva screenshot --url /playbook/alice/btc-dashboard --out dashboard.png
  alva screenshot --url /playbook/alice/btc-dashboard --out chart.png --selector ".chart-container"
  alva screenshot --url /playbook/alice/btc-dashboard --out small.png --compress --compress-quality 70 --compress-max-width 1280`,

  trading: `Usage: alva trading <subcommand> [options]

Manage trading accounts, portfolios, orders, subscriptions, and risk rules.

Subcommands:
  accounts             List all trading accounts
  portfolio            Get portfolio for an account
  orders               List orders for an account
  subscriptions        List subscriptions for an account
  equity-history       Get equity history for an account
  risk-rules           Show risk rules
  subscribe            Subscribe an account to a source feed
  unsubscribe          Unsubscribe by subscription ID
  execute              Execute a signal on an account
  update-risk-rules    Update risk rules

Portfolio/Orders/Subscriptions/Equity-history flags:
  --account-id <id>    Trading account ID (required)

Orders optional flags:
  --limit <n>          Max results
  --source <source>    Filter by source
  --since <timestamp>  Filter orders since timestamp

Equity-history optional flags:
  --timeframe <tf>     Timeframe (e.g. "1d", "1h")
  --since-ms <ms>      Start timestamp in ms
  --until-ms <ms>      End timestamp in ms

Subscribe flags:
  --account-id <id>            Account ID (required)
  --source-username <user>     Source username (required)
  --source-feed <feed>         Source feed (required)
  --playbook-id <id>           Playbook ID (required)
  --playbook-version <ver>     Playbook version (required)
  --execute-latest             Execute latest signal on subscribe

Unsubscribe flags:
  --subscription-id <id>       Subscription ID (required)

Execute flags:
  --account-id <id>            Account ID (required)
  --signal <json>              Signal JSON (required)
  --dry-run                    Dry run mode
  --source-username <user>     Source username (optional)
  --source-feed <feed>         Source feed (optional)

Update-risk-rules flags:
  --max-single-order-value <n>       Max single order value (required)
  --max-single-order-enabled <bool>  Max single order enabled (required)
  --max-daily-turnover-value <n>     Max daily turnover value (required)
  --max-daily-turnover-enabled <bool> Max daily turnover enabled (required)
  --max-daily-orders-value <n>       Max daily orders value (required)
  --max-daily-orders-enabled <bool>  Max daily orders enabled (required)

Examples:
  alva trading accounts
  alva trading portfolio --account-id acc_123
  alva trading orders --account-id acc_123 --limit 10
  alva trading subscriptions --account-id acc_123
  alva trading equity-history --account-id acc_123 --timeframe 1d
  alva trading risk-rules
  alva trading subscribe --account-id acc_123 --source-username alice --source-feed btc-signals --playbook-id pb_1 --playbook-version v1.0.0
  alva trading unsubscribe --subscription-id sub_456
  alva trading execute --account-id acc_123 --signal '{"symbol":"BTC","side":"buy","qty":0.1}' --dry-run
  alva trading update-risk-rules --max-single-order-value 10000 --max-single-order-enabled true --max-daily-turnover-value 50000 --max-daily-turnover-enabled true --max-daily-orders-value 100 --max-daily-orders-enabled true`,

  arrays: `Usage: alva arrays token <subcommand>

Manage the Arrays JWT used by sandbox scripts (secret.loadPlaintext('ARRAYS_JWT')).
The JWT is stored server-side as a jagent secret; the CLI never receives the
token itself. 'alva configure' auto-runs 'token ensure' after saving credentials.

Subcommands:
  token ensure    Provision or refresh the Arrays JWT (idempotent)
  token status    Show Arrays JWT presence, expiry, tier, and renewal hint

Examples:
  alva arrays token ensure
  alva arrays token status`,
};

interface WriteConfigDeps {
  env: Record<string, string | undefined>;
  homedir: () => string;
  mkdir: (path: string, options: { recursive: boolean }) => Promise<void>;
  writeFile: (
    path: string,
    data: string,
    options: { mode: number }
  ) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  runHooks?: (client: AlvaClient) => Promise<void>;
}

export async function handleConfigure(
  args: string[],
  deps?: WriteConfigDeps
): Promise<{
  status: string;
  apiKey: string;
  baseUrl?: string;
  profile: string;
}> {
  const flags = parseFlags(args.slice(1));
  const apiKey = flags['api-key'];
  if (!apiKey) {
    throw new CliUsageError('--api-key is required', 'configure');
  }
  if (!apiKey.startsWith('alva_')) {
    process.stderr?.write?.(
      'Warning: API key does not start with "alva_". This may not be a valid Alva API key.\n'
    );
  }

  const baseUrl = flags['base-url'];
  const profileName = flags['profile'] || 'default';
  const configInput: { apiKey: string; baseUrl?: string } = { apiKey };
  if (baseUrl) configInput.baseUrl = baseUrl;

  const writeDeps = deps ?? {
    env: process.env as Record<string, string | undefined>,
    homedir: () => os.homedir(),
    mkdir: (path: string, options: { recursive: boolean }) =>
      fsPromises.mkdir(path, options).then(() => undefined),
    writeFile: (path: string, data: string, options: { mode: number }) =>
      fsPromises.writeFile(path, data, options).then(() => undefined),
    readFile: (path: string) => fsPromises.readFile(path, 'utf-8'),
  };

  const result = await writeConfig(configInput, writeDeps, profileName);

  const client = new AlvaClient(baseUrl ? { apiKey, baseUrl } : { apiKey });
  const runHooks =
    writeDeps.runHooks ?? ((c: AlvaClient) => runPostConfigureHooks(c));
  try {
    await runHooks(client);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr?.write?.(`warning: post-configure hooks crashed: ${msg}\n`);
  }

  return {
    status: 'configured',
    apiKey: result.apiKey!,
    baseUrl: result.baseUrl,
    profile: profileName,
  };
}

const BOOLEAN_FLAGS = new Set([
  'recursive',
  'mkdir-parents',
  'push-notify',
  'help',
  'execute-latest',
  'dry-run',
  'json',
  'compress',
]);

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--no-') && BOOLEAN_FLAGS.has(arg.slice(5))) {
      flags[arg.slice(5)] = 'false';
    } else if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (BOOLEAN_FLAGS.has(arg.slice(2))) {
        flags[arg.slice(2)] = 'true';
      } else if (i + 1 < argv.length) {
        flags[arg.slice(2)] = argv[i + 1];
        i++;
      }
    }
  }
  return flags;
}

function boolFlag(val: string | undefined): boolean | undefined {
  if (val === 'true') return true;
  if (val === 'false') return false;
  return undefined;
}

function requireFlag(
  flags: Record<string, string>,
  name: string,
  command: string
): string {
  const val = flags[name];
  if (val === undefined) {
    const group = command.split(' ')[0];
    throw new CliUsageError(`--${name} is required for '${command}'`, group);
  }
  return val;
}

function requireNumericFlag(
  flags: Record<string, string>,
  name: string,
  command: string
): number {
  const val = requireFlag(flags, name, command);
  const n = Number(val);
  if (Number.isNaN(n)) {
    const group = command.split(' ')[0];
    throw new CliUsageError(
      `--${name} must be a number for '${command}', got '${val}'`,
      group
    );
  }
  return n;
}

function requirePositiveIntegerStringFlag(
  flags: Record<string, string>,
  name: string,
  command: string
): string {
  const val = requireFlag(flags, name, command);
  if (!/^[1-9]\d*$/.test(val)) {
    const group = command.split(' ')[0];
    throw new CliUsageError(
      `--${name} must be a positive integer for '${command}', got '${val}'`,
      group
    );
  }
  return val;
}

function requireGroupSubscriptionTargetType(
  flags: Record<string, string>,
  command: string
): 'feed' | 'playbook' {
  const val = requireFlag(flags, 'target-type', command).trim().toLowerCase();
  if (val === 'feed' || val === 'playbook') return val;
  throw new CliUsageError(
    `--target-type must be feed or playbook for '${command}', got '${val}'`,
    command.split(' ')[0]
  );
}

function num(val: string | undefined): number | undefined {
  if (val === undefined) return undefined;
  const n = Number(val);
  return Number.isNaN(n) ? undefined : n;
}

function jsonParse(val: string | undefined): unknown {
  if (val === undefined) return undefined;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
}

export async function dispatch(
  client: AlvaClient,
  args: string[],
  meta?: { profile?: string; baseUrl?: string; cliVersion?: string }
): Promise<unknown> {
  const group = args[0];

  if (!group || group === '--help' || group === '-h') {
    return { _help: true, text: HELP_TEXT };
  }

  // Per-command help: alva <command> --help
  if (COMMAND_HELP[group] && (args[1] === '--help' || args[1] === '-h')) {
    return { _help: true, text: COMMAND_HELP[group] };
  }

  // whoami: verify credentials and show user info
  if (group === 'whoami') {
    const user = await client.user.me();
    const record = user as unknown as Record<string, unknown>;
    const version = meta?.cliVersion ?? CLI_VERSION;
    let arraysJwtStatus: unknown;
    try {
      arraysJwtStatus = await client.arraysJwt.status();
    } catch {
      // soft-fail: omit arrays_jwt from _meta on failure
    }
    const metaBlock: Record<string, unknown> = {
      profile: meta?.profile ?? 'default',
      endpoint: meta?.baseUrl ?? client.baseUrl,
    };
    if (arraysJwtStatus !== undefined) {
      metaBlock.arrays_jwt = arraysJwtStatus;
    }
    const result: Record<string, unknown> = {
      ...record,
      _meta: metaBlock,
    };
    const minVersion = record.toolkit_min_version;
    if (
      typeof minVersion === 'string' &&
      version &&
      version !== 'dev' &&
      isVersionOlderThan(version, minVersion)
    ) {
      result._warning =
        `Warning: your toolkit version (${version}) is older than the minimum recommended version (${minVersion}). ` +
        `Please upgrade: npm install -g @alva-ai/toolkit`;
    }
    return result;
  }

  const subcommand = args[1];
  const flags = parseFlags(
    args.slice(
      group === 'run' || group === 'remix' || group === 'screenshot' ? 1 : 2
    )
  );

  // Also check for --help in flags (e.g. alva fs read --help)
  if (flags['help'] !== undefined) {
    const helpText = COMMAND_HELP[group];
    if (helpText) return { _help: true, text: helpText };
  }

  switch (group) {
    case 'user':
      if (!subcommand)
        throw new CliUsageError('Missing subcommand for user', 'user');
      if (subcommand === 'me') return client.user.me();
      throw new CliUsageError(`Unknown subcommand: user ${subcommand}`, 'user');

    case 'fs': {
      if (!subcommand)
        throw new CliUsageError('Missing subcommand for fs', 'fs');
      switch (subcommand) {
        case 'read':
          return client.fs.read({
            path: requireFlag(flags, 'path', 'fs read'),
            offset: num(flags['offset']),
            size: num(flags['size']),
          });
        case 'write':
          if (flags['file']) {
            const fileData = fs.readFileSync(flags['file']);
            return client.fs.rawWrite({
              path: requireFlag(flags, 'path', 'fs write'),
              body: fileData as unknown as BodyInit,
              mkdir_parents: boolFlag(flags['mkdir-parents']) ?? true,
            });
          }
          return client.fs.write({
            path: requireFlag(flags, 'path', 'fs write'),
            data: requireFlag(flags, 'data', 'fs write'),
            mkdir_parents: boolFlag(flags['mkdir-parents']) ?? true,
          });
        case 'stat':
          return client.fs.stat({
            path: requireFlag(flags, 'path', 'fs stat'),
          });
        case 'readdir':
          return client.fs.readdir({
            path: requireFlag(flags, 'path', 'fs readdir'),
            recursive: boolFlag(flags['recursive']),
          });
        case 'mkdir':
          return client.fs.mkdir({
            path: requireFlag(flags, 'path', 'fs mkdir'),
          });
        case 'remove':
          return client.fs.remove({
            path: requireFlag(flags, 'path', 'fs remove'),
            recursive: boolFlag(flags['recursive']),
          });
        case 'rename':
          return client.fs.rename({
            old_path: requireFlag(flags, 'old-path', 'fs rename'),
            new_path: requireFlag(flags, 'new-path', 'fs rename'),
          });
        case 'copy':
          return client.fs.copy({
            src_path: requireFlag(flags, 'src-path', 'fs copy'),
            dst_path: requireFlag(flags, 'dst-path', 'fs copy'),
          });
        case 'symlink':
          return client.fs.symlink({
            target_path: requireFlag(flags, 'target-path', 'fs symlink'),
            link_path: requireFlag(flags, 'link-path', 'fs symlink'),
          });
        case 'readlink':
          return client.fs.readlink({
            path: requireFlag(flags, 'path', 'fs readlink'),
          });
        case 'chmod':
          return client.fs.chmod({
            path: requireFlag(flags, 'path', 'fs chmod'),
            mode: parseInt(requireFlag(flags, 'mode', 'fs chmod'), 8),
          });
        case 'grant':
          return client.fs.grant({
            path: requireFlag(flags, 'path', 'fs grant'),
            subject: requireFlag(flags, 'subject', 'fs grant'),
            permission: requireFlag(flags, 'permission', 'fs grant'),
          });
        case 'revoke':
          return client.fs.revoke({
            path: requireFlag(flags, 'path', 'fs revoke'),
            subject: requireFlag(flags, 'subject', 'fs revoke'),
            permission: requireFlag(flags, 'permission', 'fs revoke'),
          });
        default:
          throw new CliUsageError(`Unknown subcommand: fs ${subcommand}`, 'fs');
      }
    }

    case 'run': {
      const sourceFlags = ['code', 'local-file', 'entry-path'].filter(
        (f) => flags[f] !== undefined
      );
      if (sourceFlags.length > 1) {
        throw new CliUsageError(
          `--${sourceFlags.join(' and --')} are mutually exclusive`,
          'run'
        );
      }
      let code = flags['code'];
      if (flags['local-file']) {
        code = fs.readFileSync(flags['local-file'], 'utf-8') as string;
      }
      return client.run.execute({
        code,
        entry_path: flags['entry-path'],
        working_dir: flags['working-dir'],
        args: jsonParse(flags['args']) as Record<string, unknown> | undefined,
      });
    }

    case 'deploy': {
      if (!subcommand)
        throw new CliUsageError('Missing subcommand for deploy', 'deploy');
      switch (subcommand) {
        case 'create':
          return client.deploy.create({
            name: requireFlag(flags, 'name', 'deploy create'),
            path: requireFlag(flags, 'path', 'deploy create'),
            cron_expression: requireFlag(flags, 'cron', 'deploy create'),
            args: jsonParse(flags['args']) as
              | Record<string, unknown>
              | undefined,
            push_notify: boolFlag(flags['push-notify']),
          });
        case 'list':
          return client.deploy.list({
            limit: num(flags['limit']),
            cursor: flags['cursor'],
          });
        case 'get':
          return client.deploy.get({
            id: requireNumericFlag(flags, 'id', 'deploy get'),
          });
        case 'update':
          return client.deploy.update({
            id: requireNumericFlag(flags, 'id', 'deploy update'),
            name: flags['name'],
            cron_expression: flags['cron'],
            args: jsonParse(flags['args']) as
              | Record<string, unknown>
              | undefined,
            push_notify: boolFlag(flags['push-notify']),
          });
        case 'delete':
          return client.deploy.delete({
            id: requireNumericFlag(flags, 'id', 'deploy delete'),
          });
        case 'pause':
          return client.deploy.pause({
            id: requireNumericFlag(flags, 'id', 'deploy pause'),
          });
        case 'resume':
          return client.deploy.resume({
            id: requireNumericFlag(flags, 'id', 'deploy resume'),
          });
        case 'trigger':
          return client.deploy.trigger({
            id: requireNumericFlag(flags, 'id', 'deploy trigger'),
          });
        case 'runs':
          return client.deploy.listRuns({
            cronjob_id: requireNumericFlag(flags, 'id', 'deploy runs'),
            first: num(flags['first']),
            cursor: num(flags['cursor']),
          });
        case 'run-logs':
          return client.deploy.getRunLogs({
            cronjob_id: requireNumericFlag(flags, 'id', 'deploy run-logs'),
            run_id: requireNumericFlag(flags, 'run-id', 'deploy run-logs'),
          });
        default:
          throw new CliUsageError(
            `Unknown subcommand: deploy ${subcommand}`,
            'deploy'
          );
      }
    }

    case 'release': {
      if (!subcommand)
        throw new CliUsageError('Missing subcommand for release', 'release');
      switch (subcommand) {
        case 'feed':
          return client.release.feed({
            name: requireFlag(flags, 'name', 'release feed'),
            version: requireFlag(flags, 'version', 'release feed'),
            cronjob_id: requireNumericFlag(flags, 'cronjob-id', 'release feed'),
            view_json: jsonParse(flags['view-json']) as
              | Record<string, unknown>
              | undefined,
            description: flags['description'],
            changelog: flags['changelog'],
          });
        case 'playbook-draft':
          return client.release.playbookDraft({
            name: requireFlag(flags, 'name', 'release playbook-draft'),
            display_name: requireFlag(
              flags,
              'display-name',
              'release playbook-draft'
            ),
            description: flags['description'],
            feeds: jsonParse(
              requireFlag(flags, 'feeds', 'release playbook-draft')
            ) as Array<{
              feed_id: number;
              feed_major?: number;
            }>,
            trading_symbols: flags['trading-symbols']
              ? (jsonParse(flags['trading-symbols']) as string[])
              : undefined,
            template_id: flags['template-id'],
          });
        case 'playbook':
          return client.release.playbook({
            name: requireFlag(flags, 'name', 'release playbook'),
            version: requireFlag(flags, 'version', 'release playbook'),
            feeds: jsonParse(
              requireFlag(flags, 'feeds', 'release playbook')
            ) as Array<{
              feed_id: number;
              feed_major?: number;
            }>,
            changelog: requireFlag(flags, 'changelog', 'release playbook'),
            readme_url: requireFlag(flags, 'readme-url', 'release playbook'),
          });
        default:
          throw new CliUsageError(
            `Unknown subcommand: release ${subcommand}`,
            'release'
          );
      }
    }

    case 'secrets': {
      if (!subcommand)
        throw new CliUsageError('Missing subcommand for secrets', 'secrets');
      switch (subcommand) {
        case 'create':
          return client.secrets.create({
            name: requireFlag(flags, 'name', 'secrets create'),
            value: requireFlag(flags, 'value', 'secrets create'),
          });
        case 'list':
          return client.secrets.list();
        case 'get':
          return client.secrets.get({
            name: requireFlag(flags, 'name', 'secrets get'),
          });
        case 'update':
          return client.secrets.update({
            name: requireFlag(flags, 'name', 'secrets update'),
            value: requireFlag(flags, 'value', 'secrets update'),
          });
        case 'delete':
          return client.secrets.delete({
            name: requireFlag(flags, 'name', 'secrets delete'),
          });
        default:
          throw new CliUsageError(
            `Unknown subcommand: secrets ${subcommand}`,
            'secrets'
          );
      }
    }

    case 'sdk': {
      if (!subcommand)
        throw new CliUsageError('Missing subcommand for sdk', 'sdk');
      switch (subcommand) {
        case 'doc':
          return client.sdk.doc({
            name: requireFlag(flags, 'name', 'sdk doc'),
          });
        case 'partitions':
          return client.sdk.partitions();
        case 'partition-summary':
          return client.sdk.partitionSummary({
            partition: requireFlag(flags, 'partition', 'sdk partition-summary'),
          });
        default:
          throw new CliUsageError(
            `Unknown subcommand: sdk ${subcommand}`,
            'sdk'
          );
      }
    }

    case 'skills': {
      if (!subcommand)
        throw new CliUsageError('Missing subcommand for skills', 'skills');
      const asJson = boolFlag(flags['json']) ?? false;
      switch (subcommand) {
        case 'list': {
          const result = await client.skills.list();
          return asJson ? result : formatSkillsList(result);
        }
        case 'summary': {
          const result = await client.skills.summary({
            name: requireFlag(flags, 'name', 'skills summary'),
          });
          return asJson ? result : formatSkillSummary(result);
        }
        case 'endpoint': {
          const result = await client.skills.endpoint({
            name: requireFlag(flags, 'name', 'skills endpoint'),
            file: requireFlag(flags, 'file', 'skills endpoint'),
          });
          return asJson ? result : formatSkillEndpoint(result);
        }
        default:
          throw new CliUsageError(
            `Unknown subcommand: skills ${subcommand}`,
            'skills'
          );
      }
    }

    case 'templates': {
      if (!subcommand)
        throw new CliUsageError(
          'Missing subcommand for templates',
          'templates'
        );
      switch (subcommand) {
        case 'list':
          return client.templates.list({
            category: flags['category'],
            username: flags['username'],
          });
        case 'categories':
          return client.templates.categories();
        case 'get':
          return client.templates.get({
            username: requireFlag(flags, 'username', 'templates get'),
            name: requireFlag(flags, 'name', 'templates get'),
          });
        case 'files':
          return client.templates.files({
            username: requireFlag(flags, 'username', 'templates files'),
            name: requireFlag(flags, 'name', 'templates files'),
          });
        default:
          throw new CliUsageError(
            `Unknown subcommand: templates ${subcommand}`,
            'templates'
          );
      }
    }

    case 'comments': {
      if (!subcommand)
        throw new CliUsageError('Missing subcommand for comments', 'comments');
      switch (subcommand) {
        case 'create':
          return client.comments.create({
            username: requireFlag(flags, 'username', 'comments create'),
            name: requireFlag(flags, 'name', 'comments create'),
            content: requireFlag(flags, 'content', 'comments create'),
            parent_id: num(flags['parent-id']),
          });
        case 'pin':
          return client.comments.pin({
            comment_id: requireNumericFlag(flags, 'comment-id', 'comments pin'),
          });
        case 'unpin':
          return client.comments.unpin({
            comment_id: requireNumericFlag(
              flags,
              'comment-id',
              'comments unpin'
            ),
          });
        default:
          throw new CliUsageError(
            `Unknown subcommand: comments ${subcommand}`,
            'comments'
          );
      }
    }

    case 'push-subscriptions': {
      if (!subcommand)
        throw new CliUsageError(
          'Missing subcommand for push-subscriptions',
          'push-subscriptions'
        );
      switch (subcommand) {
        case 'subscribe-playbook':
          return client.pushSubscriptions.subscribePlaybook({
            username: requireFlag(
              flags,
              'username',
              'push-subscriptions subscribe-playbook'
            ),
            name: requireFlag(
              flags,
              'name',
              'push-subscriptions subscribe-playbook'
            ),
          });
        case 'unsubscribe-playbook':
          return client.pushSubscriptions.unsubscribePlaybook({
            username: requireFlag(
              flags,
              'username',
              'push-subscriptions unsubscribe-playbook'
            ),
            name: requireFlag(
              flags,
              'name',
              'push-subscriptions unsubscribe-playbook'
            ),
          });
        case 'subscribe-feed':
          return client.pushSubscriptions.subscribeFeed({
            username: requireFlag(
              flags,
              'username',
              'push-subscriptions subscribe-feed'
            ),
            name: requireFlag(
              flags,
              'name',
              'push-subscriptions subscribe-feed'
            ),
          });
        case 'unsubscribe-feed':
          return client.pushSubscriptions.unsubscribeFeed({
            username: requireFlag(
              flags,
              'username',
              'push-subscriptions unsubscribe-feed'
            ),
            name: requireFlag(
              flags,
              'name',
              'push-subscriptions unsubscribe-feed'
            ),
          });
        case 'list':
          return client.pushSubscriptions.list({
            include_history: flags['include-history'] !== undefined,
          });
        default:
          throw new CliUsageError(
            `Unknown subcommand: push-subscriptions ${subcommand}`,
            'push-subscriptions'
          );
      }
    }

    case 'channel': {
      if (!subcommand || subcommand === '--help' || subcommand === '-h') {
        return { _help: true, text: COMMAND_HELP.channel };
      }
      if (subcommand !== 'group-subscriptions') {
        throw new CliUsageError(
          `Unknown subcommand: channel ${subcommand}`,
          'channel'
        );
      }
      const leaf = args[2];
      if (!leaf || leaf === '--help' || leaf === '-h') {
        return { _help: true, text: COMMAND_HELP.channel };
      }
      const channelFlags = parseFlags(args.slice(3));
      const commandName = `channel group-subscriptions ${leaf}`;
      switch (leaf) {
        case 'context':
          return client.channelGroupSubscriptions.context({
            session_id: requirePositiveIntegerStringFlag(
              channelFlags,
              'session-id',
              commandName
            ),
          });
        case 'list':
          return client.channelGroupSubscriptions.list({
            session_id: requirePositiveIntegerStringFlag(
              channelFlags,
              'session-id',
              commandName
            ),
          });
        case 'subscribe':
          return client.channelGroupSubscriptions.subscribe({
            session_id: requirePositiveIntegerStringFlag(
              channelFlags,
              'session-id',
              commandName
            ),
            target_type: requireGroupSubscriptionTargetType(
              channelFlags,
              commandName
            ),
            target_id: requirePositiveIntegerStringFlag(
              channelFlags,
              'target-id',
              commandName
            ),
          });
        case 'unsubscribe':
          return client.channelGroupSubscriptions.unsubscribe({
            session_id: requirePositiveIntegerStringFlag(
              channelFlags,
              'session-id',
              commandName
            ),
            target_type: requireGroupSubscriptionTargetType(
              channelFlags,
              commandName
            ),
            target_id: requirePositiveIntegerStringFlag(
              channelFlags,
              'target-id',
              commandName
            ),
          });
        default:
          throw new CliUsageError(
            `Unknown subcommand: channel group-subscriptions ${leaf}`,
            'channel'
          );
      }
    }

    case 'remix':
      return client.remix.save({
        child: {
          username: requireFlag(flags, 'child-username', 'remix'),
          name: requireFlag(flags, 'child-name', 'remix'),
        },
        parents: jsonParse(requireFlag(flags, 'parents', 'remix')) as Array<{
          username: string;
          name: string;
        }>,
      });

    case 'arrays': {
      if (!subcommand || subcommand === '--help' || subcommand === '-h') {
        return { _help: true, text: COMMAND_HELP.arrays };
      }
      if (subcommand === 'token') {
        const leaf = args[2];
        if (!leaf || leaf === '--help' || leaf === '-h') {
          return { _help: true, text: COMMAND_HELP.arrays };
        }
        switch (leaf) {
          case 'ensure':
            return client.arraysJwt.ensure();
          case 'status':
            return client.arraysJwt.status();
          default:
            throw new Error(
              `Unknown subcommand 'arrays token ${leaf}'. Use 'alva arrays --help' for usage.`
            );
        }
      }
      throw new Error(
        `Unknown subcommand 'arrays ${subcommand}'. Use 'alva arrays --help' for usage.`
      );
    }

    case 'screenshot': {
      const outFile = requireFlag(flags, 'out', 'screenshot');
      const compressQuality = flags['compress-quality'];
      const compressMaxWidth = flags['compress-max-width'];
      const result = await client.screenshot.capture({
        url: requireFlag(flags, 'url', 'screenshot'),
        selector: flags['selector'],
        xpath: flags['xpath'],
        compress: boolFlag(flags['compress']),
        compressQuality:
          compressQuality !== undefined ? Number(compressQuality) : undefined,
        compressMaxWidth:
          compressMaxWidth !== undefined ? Number(compressMaxWidth) : undefined,
      });
      const buf = Buffer.from(result as ArrayBuffer);
      if (buf.length === 0) {
        throw new CliUsageError(
          'Screenshot service returned empty response (0 bytes). The service may be overloaded — retry in a few seconds.',
          'screenshot'
        );
      }
      fs.writeFileSync(outFile, buf);
      return { written: outFile, bytes: buf.length };
    }

    case 'trading': {
      if (!subcommand)
        throw new CliUsageError('Missing subcommand for trading', 'trading');
      switch (subcommand) {
        case 'accounts':
          return client.trading.accounts();
        case 'portfolio':
          return client.trading.portfolio(
            requireFlag(flags, 'account-id', 'trading portfolio')
          );
        case 'orders':
          return client.trading.orders({
            accountId: requireFlag(flags, 'account-id', 'trading orders'),
            source: flags['source'],
            since: num(flags['since']),
            limit: num(flags['limit']),
          });
        case 'subscriptions':
          return client.trading.subscriptions(
            requireFlag(flags, 'account-id', 'trading subscriptions')
          );
        case 'equity-history':
          return client.trading.equityHistory({
            accountId: requireFlag(
              flags,
              'account-id',
              'trading equity-history'
            ),
            timeframe: flags['timeframe'],
            sinceMs: num(flags['since-ms']),
            untilMs: num(flags['until-ms']),
          });
        case 'risk-rules':
          return client.trading.riskRules();
        case 'subscribe':
          return client.trading.subscribe({
            accountId: requireFlag(flags, 'account-id', 'trading subscribe'),
            sourceUsername: requireFlag(
              flags,
              'source-username',
              'trading subscribe'
            ),
            sourceFeed: requireFlag(flags, 'source-feed', 'trading subscribe'),
            playbookId: requireFlag(flags, 'playbook-id', 'trading subscribe'),
            playbookVersion: requireFlag(
              flags,
              'playbook-version',
              'trading subscribe'
            ),
            executeLatest: boolFlag(flags['execute-latest']),
          });
        case 'unsubscribe':
          return client.trading.unsubscribe(
            requireFlag(flags, 'subscription-id', 'trading unsubscribe')
          );
        case 'execute':
          return client.trading.execute({
            accountId: requireFlag(flags, 'account-id', 'trading execute'),
            signalJson: requireFlag(flags, 'signal', 'trading execute'),
            dryRun: boolFlag(flags['dry-run']) ?? false,
            sourceUsername: flags['source-username'],
            sourceFeed: flags['source-feed'],
          });
        case 'update-risk-rules':
          return client.trading.updateRiskRules({
            maxSingleOrder: {
              value: requireNumericFlag(
                flags,
                'max-single-order-value',
                'trading update-risk-rules'
              ),
              enabled:
                requireFlag(
                  flags,
                  'max-single-order-enabled',
                  'trading update-risk-rules'
                ) === 'true',
            },
            maxDailyTurnover: {
              value: requireNumericFlag(
                flags,
                'max-daily-turnover-value',
                'trading update-risk-rules'
              ),
              enabled:
                requireFlag(
                  flags,
                  'max-daily-turnover-enabled',
                  'trading update-risk-rules'
                ) === 'true',
            },
            maxDailyOrders: {
              value: requireNumericFlag(
                flags,
                'max-daily-orders-value',
                'trading update-risk-rules'
              ),
              enabled:
                requireFlag(
                  flags,
                  'max-daily-orders-enabled',
                  'trading update-risk-rules'
                ) === 'true',
            },
          });
        default:
          throw new CliUsageError(
            `Unknown subcommand: trading ${subcommand}`,
            'trading'
          );
      }
    }

    case 'auth': {
      // bare `auth`, `auth --help`, `auth login --help` all show help
      const authSub = args[1];
      if (
        !authSub ||
        authSub === '--help' ||
        authSub === '-h' ||
        args[2] === '--help' ||
        args[2] === '-h'
      ) {
        return { _help: true, text: COMMAND_HELP.auth };
      }
      // auth login is handled in main() before loadConfig; if we reach here
      // it means dispatch was called directly (shouldn't happen in production)
      throw new CliUsageError(`Unknown auth subcommand: '${authSub}'`, 'auth');
    }

    default:
      throw new CliUsageError(`Unknown command: '${group}'`);
  }
}

/**
 * Strips global flags (--api-key, --base-url, --profile, --arrays-endpoint)
 * and their associated values from an argv list. Supports both
 * `--flag value` and `--flag=value` forms.
 */
export function stripGlobalFlags(argv: string[]): string[] {
  const GLOBAL_FLAGS = [
    '--api-key',
    '--base-url',
    '--profile',
    '--arrays-endpoint',
  ];
  const result: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (GLOBAL_FLAGS.includes(a)) {
      i++; // skip the value
      continue;
    }
    if (GLOBAL_FLAGS.some((f) => a.startsWith(`${f}=`))) {
      continue;
    }
    result.push(a);
  }
  return result;
}

async function main() {
  try {
    const rawArgs = process.argv.slice(2);

    // Handle --version before loading config (doesn't need auth)
    if (rawArgs[0] === '-v' || rawArgs[0] === '--version') {
      process.stdout.write(`alva version ${CLI_VERSION}\n`);
      return;
    }

    // Handle configure before loading config (doesn't need existing auth)
    if (rawArgs[0] === 'configure') {
      if (rawArgs[1] === '--help' || rawArgs[1] === '-h') {
        process.stdout.write(COMMAND_HELP['configure'] + '\n');
        return;
      }
      const result = await handleConfigure(rawArgs);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }

    // Handle auth before loading config (user doesn't have config yet when logging in)
    if (rawArgs[0] === 'auth') {
      const authSub = rawArgs[1];
      if (
        !authSub ||
        authSub === '--help' ||
        authSub === '-h' ||
        rawArgs[2] === '--help' ||
        rawArgs[2] === '-h'
      ) {
        process.stdout.write(`${COMMAND_HELP.auth}\n`);
        return;
      }
      if (authSub === 'login') {
        const result = await handleAuthLogin(rawArgs);
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
      }
      process.stdout.write(`${COMMAND_HELP.auth}\n`);
      return;
    }

    const config = loadConfig({
      argv: rawArgs,
      env: process.env as Record<string, string | undefined>,
      readFile: (path: string) => fs.readFileSync(path, 'utf-8'),
      homedir: () => os.homedir(),
    });

    const client = new AlvaClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      arraysBaseUrl: config.arraysBaseUrl,
    });

    const cleanArgs = stripGlobalFlags(rawArgs);

    const result = await dispatch(client, cleanArgs, {
      profile: config.profile,
      baseUrl: config.baseUrl,
      cliVersion: CLI_VERSION,
    });
    if (result && typeof result === 'object' && '_warning' in result) {
      process.stderr.write(
        (result as unknown as { _warning: string })._warning + '\n'
      );
      delete (result as Record<string, unknown>)._warning;
    }
    if (result && typeof result === 'object' && '_help' in result) {
      const helpResult = result as unknown as { text: string };
      process.stdout.write(helpResult.text + '\n');
      return;
    }
    if (result instanceof ArrayBuffer) {
      process.stdout.write(Buffer.from(result));
      return;
    }
    if (typeof result === 'string') {
      // Print raw string (e.g. `fs read` of a plain-text file). JSON-stringifying
      // would wrap it in quotes and emit an escaped form, which is wrong for
      // scripting/pipe use and breaks downstream consumers that expect the
      // exact file bytes.
      process.stdout.write(result);
      return;
    }
    if (result !== undefined) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (err) {
    if (err instanceof CliUsageError) {
      const help = err.command ? COMMAND_HELP[err.command] : HELP_TEXT;
      process.stderr.write(`Error: ${err.message}\n`);
      if (help) process.stderr.write(`\n${help}\n`);
      process.exit(1);
    } else if (err instanceof AlvaError) {
      const error = {
        code: err.code,
        message: err.message,
        status: err.status,
      };
      process.stderr.write(`${JSON.stringify({ error }, null, 2)}\n`);
      process.exit(1);
    } else {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${message}\n`);
      process.exit(1);
    }
  }
}

// Run main() when executed as a script (node cli.js or via symlinked `alva` binary),
// but not when imported for testing (vitest imports dispatch directly).
const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('cli.mjs') ||
    process.argv[1].endsWith('cli.js') ||
    process.argv[1].endsWith('/alva') ||
    process.argv[1].endsWith('\\alva'));
if (isDirectRun) {
  main();
}
