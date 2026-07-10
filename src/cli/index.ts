import * as crypto from 'node:crypto';
import { AlvaClient } from '../client.js';
import { AlvaError, CliUsageError } from '../error.js';
import { loadConfig, writeConfig } from './config.js';
import { handleAuthLogin, handleAuthLoginNoBrowser } from './auth.js';
import { selectMode } from './modeSelect.js';
import { runPostConfigureHooks } from './postConfigureHooks.js';
import {
  formatSkillsList,
  formatSkillSummary,
  formatSkillEndpoint,
} from './dataSkillsFormat.js';
import {
  formatPlaybookSkillsList,
  formatPlaybookSkillsTags,
  formatPlaybookSkillGet,
  formatPlaybookSkillFile,
} from './playbookSkillsFormat.js';
import {
  PLAYBOOK_VISIBILITIES,
  webOriginFromApiBase,
  type PlaybookVisibility,
} from '../resources/playbooks.js';
import {
  formatTrendingPlaybooks,
  formatPlaybook,
  formatPlaybookList,
} from './playbooksFormat.js';
import {
  formatAlertList,
  formatAutomationDetail,
  formatAutomationList,
} from './productFormat.js';
import * as fs from 'fs';
import * as os from 'os';
import * as fsPromises from 'fs/promises';
import { Agent, setGlobalDispatcher } from 'undici';

export { CliUsageError } from '../error.js';

declare const __VERSION__: string;
export const CLI_VERSION: string =
  typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';
export const DEFAULT_RUN_TIMEOUT_MS = 600_000;
const RUN_TIMEOUT_ENV = 'ALVA_RUN_TIMEOUT_MS';
let configuredRunFetchTimeoutMs: number | undefined;

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
  loop        Self-scheduled in-channel goal loops (create)
  service-account  Restricted run-as identities (create, list, delete, grant, revoke)
  release     Feed and playbook releases (feed, playbook-draft, playbook)
  lint        Design-system lint (playbook)
  automation  Automation management (list, inspect, publish, stop, resume, delete)
  alert       Alert management (list, follows, enable, disable, history, preferences, enable-session-completed, disable-session-completed)
  feed        Legacy automation alias (list, stop, resume, delete, set-visibility)
  playbooks   Playbook discovery (trending, get, list) and visibility
  functions   Playbook UDF function management (register, list, delete, invoke, allowance)
  credits     Credit wallet and self-scoped usage history (wallet, items)
  secrets     Secret management (create, list, get, update, delete)
  sdk         SDK documentation (doc, partitions, partition-summary)
  skillhub    Playbook skills (list, tags, get, file)
  data-skills Data-skill documentation from the Arrays backend (list, summary, endpoint)
  comments    Playbook comments (create, pin, unpin)
  notification-history  Notification delivery history (list-playbook, list-feed)
  notification-preferences  Notification preferences (list, enable-session-completed, disable-session-completed)
  feedback    Submit user-confirmed Alva platform feedback (submit)
  subscriptions       Legacy alert/follow operations (subscribe-playbook, subscribe-feed, list, follows)
  channel     Channel group operations (group-subscriptions context, list, subscribe, unsubscribe)
  remix       Save playbook remix lineage
  portfolio   Connected-account portfolio (accounts, summary, activities)
  trading     Trading operations (accounts, portfolio, orders, subscriptions, equity-history, risk-rules, subscribe, unsubscribe, execute, update-risk-rules)
  broker      Agentic order execution — venue-native passthrough to trex (accounts, quote, order, balance, positions, ...; run 'alva broker describe')
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

  auth: `Usage: alva auth login [--browser | --no-browser] [--profile <name>]

By default, opens a browser locally and listens for the OAuth callback. Use
--no-browser for SSH / container / headless environments — alva will print
a URL to open on any device, then prompt you to paste the code shown.

Auto-detect picks --no-browser when DISPLAY is missing on Linux, when
SSH_CONNECTION is set without DISPLAY forwarding, or when CONTAINER /
DEVCONTAINER is set.

Subcommands:
  login       Authenticate and save credentials (browser or no-browser)

Flags:
  --browser           Force the local browser + 127.0.0.1 callback flow
  --no-browser        Force the paste-code flow (no local listener)
  --profile <name>    Profile name to save credentials under (default: "default")

Examples:
  alva auth login                       # auto-detect
  alva auth login --no-browser          # force paste-code flow
  alva auth login --browser             # force browser flow
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
  slack_username      Slack display name if connected, null otherwise

Examples:
  alva user me`,

  credits: `Usage: alva credits <subcommand> [options]

Read the authenticated user's own credit wallet and consumption history.

Subcommands:
  wallet      Show current wallet balance, total remaining, and UTC today usage
  items       List raw credit consumption records in a time window

Items window flags (choose exactly one):
  --today                   UTC day containing the current time
  --last <duration>         Recent window, e.g. 7d, 24h, 30m
  --start <time> --end <time>  Explicit UTC window; accepts ISO, YYYY-MM-DD, or Unix ms

Items optional flags:
  --session-id <id>         Filter to one chat/session
  --first <n>               Page size (1-500)
  --after <cursor>          Opaque cursor from pageInfo.endCursor

Notes:
  - Results are viewer-scoped by the backend; there is no --user-id override.
  - --start is inclusive and --end is exclusive.

Examples:
  alva credits wallet
  alva credits items --today --first 20
  alva credits items --last 7d --session-id 2069373335591239680
  alva credits items --start 2026-06-23 --end 2026-06-24`,

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
  --max-heap-size-mb <mb>   Override the V8 heap limit in MB (1-2048, default 256)
  --timeout-ms <ms>      Client HTTP timeout for /api/v1/run (default: ${DEFAULT_RUN_TIMEOUT_MS}; env: ${RUN_TIMEOUT_ENV})

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
  Default V8 heap limit is 256 MB; override with --max-heap-size-mb (1-2048)

Examples:
  alva run --code "1 + 2 + 3;"
  alva run --code "JSON.stringify(require('env').args);" --args '{"symbol":"BTC"}'
  alva run --entry-path "~/feeds/my-feed/v1/src/index.js"
  alva run --entry-path "~/tasks/analyze/src/index.js" --args '{"symbol":"NVDA","limit":50}'
  alva run --local-file ./my-script.js --args '{"symbol":"BTC"}'
  alva run --entry-path "~/tasks/heavy/src/index.js" --max-heap-size-mb 1024
  alva run --entry-path "~/feeds/slow/v1/src/index.js" --timeout-ms 900000`,

  deploy: `Usage: alva deploy <subcommand> [options]

Manage scheduled cronjobs that run your scripts on a cron schedule.
Min interval: 1 minute.

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

Create/Update flags:
  --name <name>          Cronjob name (required on create, 1-63 lowercase alphanumeric/hyphens)
  --path <path>          Path to script on ALFS (required on create, must exist)
  --cron <expression>    Cron expression (required on create, e.g. "0 */4 * * *")
  --args <json>          JSON object passed to require("env").args
  --push-notify          Enable Telegram push notifications on completion
  --no-push-notify       Disable push notifications
  --max-heap-size-mb <mb>  Override per-cronjob V8 heap limit (1-2046, default uses server config)
  --run-as-service-account <id>  Run the cronjob under a service-account identity
                         (id from "alva service-account create"); restricts file
                         access to the SA's grants. Omit on update ⇒ unchanged (#602)
  --clear-run-as         Clear run_as on update — run the cronjob as yourself
                         again (mutually exclusive with --run-as-service-account)

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

  loop: `Usage: alva loop <subcommand> [options]

Create a self-scheduled, in-channel goal loop: a cronjob that each tick runs
one fire-and-forget agent turn on a channel's stable main session (via the
@alva/loop SDK), continuing that channel's conversation toward a goal. Every
loop gets a lifetime ceiling (default 7 days) so a self-scheduled loop always
terminates. Sugar over 'alva deploy create' — it seeds a shared loop-runner
script and packs the goal/channel into the cronjob's args.

Subcommands:
  create     Create a loop (seeds the shared loop-runner + a cronjob)

Create flags:
  --goal <text>          Instruction run each tick (required)
  --cron <expression>    Cron schedule (required, e.g. "0 * * * *")
  --channel-id <id>      Target channel id. Omit ⇒ your DM/agent channel
  --expires-in <dur>     Lifetime: 30m | 24h | 7d, or 'never' (unbounded —
                         discouraged). Default: 7d
  --name <name>          Cronjob name (default: derived from --goal;
                         1-63 lowercase alphanumeric/hyphens)

Examples:
  alva loop create --channel-id 7284... --goal "watch NVDA pre-market, alert on setup" --cron "0 * * * *"
  alva loop create --goal "summarize my unread channels" --cron "0 8 * * *" --expires-in 30d`,

  'service-account': `Usage: alva service-account <subcommand> [options]

Manage restricted run-as identities. A service account executes a UDF or
cronjob with only the ALFS paths you grant it; billing/audit stay with you.
Set the resulting id as --run-as-service-account on a UDF/cronjob. Opt-in:
no run-as = run as owner. See the service-accounts skill reference.

Subcommands:
  create     Create a service account (--name <label>)
  list       List the service accounts you own
  delete     Delete a service account (--id <id>); referencing jobs fail-close
  grant      Grant an ALFS path (--id <id> --path <path> --permission read|write|import)
  revoke     Revoke an ALFS path (--id <id> --path <path> --permission ...)

Examples:
  alva service-account create --name fintwit-bot
  alva service-account grant --id 90123 --path '~/feeds/x/v1/src/index.js' --permission read
  alva service-account grant --id 90123 --path '~/feeds/x/v1/' --permission read
  alva deploy create --name x-update --path '~/feeds/x/v1/src/index.js' \\
    --cron "0 */4 * * *" --run-as-service-account 90123
  alva service-account revoke --id 90123 --path '~/feeds/x/v1/' --permission read
  alva service-account delete --id 90123`,

  automation: `Usage: alva automation <subcommand> [options]

Manage automations. This is the product-facing surface for what older CLI
commands called "feeds"; ids are currently the same underlying feed ids.

Subcommands:
  list      List automations owned by the caller
  inspect   Inspect one automation and show its flow config path when available
  publish   Publish/register an automation after deploying its cronjob
  stop      Stop an automation's producer cronjob
  resume    Resume a stopped automation's producer cronjob
  delete    Soft-delete an automation

List flags:
  --limit <n>      Max results per page (default 50, max 100 server-side)
  --cursor <token> Pagination cursor from previous response
  --status <s>     active | paused | all (default: active)
  --json           Print raw JSON instead of a human-readable summary

Publish flags:
  --name <name>          Automation name, unique per user (required)
  --version <version>    Semantic version, e.g. "1.0.0" (required)
  --cronjob-id <id>      ID of the backing cronjob (required)
  --view-json <json>     View configuration JSON
  --description <text>   Automation description
  --changelog <text>     Per-major changelog summary
  --agent-type <type>    Agent kind that produces this automation, e.g. "alpi"

Lifecycle flags:
  --id <automation_id>   Numeric automation id (required for inspect/stop/resume/delete)

Examples:
  alva automation list
  alva automation list --status all --limit 20
  alva automation inspect --id 42
  alva automation publish --name btc-ema --version 1.0.0 --cronjob-id 42
  alva automation stop --id 42
  alva automation resume --id 42
  alva automation delete --id 42`,

  alert: `Usage: alva alert <subcommand> [options]

Manage alerts. Alerts are personal notification opt-ins for automations or
playbooks. Delivery history and global alert preferences live here too.

Subcommands:
  list          List the caller's active alerts
  follows       List the playbooks the caller follows
  enable        Enable an alert for an automation or playbook
  disable       Disable alerts by automation/playbook name or id
  history       List alert delivery history for an automation or playbook
  preferences   List global alert preferences
  enable-session-completed
  disable-session-completed

Target flags:
  --automation <owner/name>  Automation target
  --playbook <owner/name>    Playbook target

Disable-by-id flags:
  --automation-ids <a,b>     Comma-separated automation target ids
  --playbook-ids <a,b>       Comma-separated playbook target ids
  --feed-ids <a,b>           Legacy alias for --automation-ids

List flags:
  --first <n>      Optional page size
  --cursor <token> Optional cursor from previous response
  --json           Print raw JSON instead of a human-readable summary

Follows flags:
  --limit <n>      Optional page size
  --cursor <token> Optional cursor from previous response

History flags:
  --channel <name>   Optional delivery channel filter
  --status <status>  Optional status filter (sent, failed, filtered)
  --since <seconds>  Optional Unix seconds lower bound

Examples:
  alva alert list
  alva alert follows --limit 20
  alva alert enable --automation alice/btc-ema
  alva alert disable --automation alice/btc-ema
  alva alert enable --playbook alice/btc-dashboard
  alva alert disable --automation-ids 13292
  alva alert disable --feed-ids 13292
  alva alert history --automation alice/btc-ema --status sent
  alva alert preferences`,

  feed: `Usage: alva feed <subcommand> [options]

Legacy alias for automation lifecycle management. Prefer "alva automation".

Subcommands:
  list        List feeds owned by the caller
  stop        Stop a feed's producer cronjob
  resume      Resume a stopped feed's producer cronjob
  delete      Soft-delete a feed and all its active majors
  set-visibility  Publish or unpublish a feed (--visibility public|private)

Flags:
  --id <feed_id>       Numeric feed id (required for stop/resume/delete/set-visibility)
  --visibility <level> public | private (required for set-visibility)

List flags:
  --limit <n>      Max results per page (default 50, max 100 server-side)
  --cursor <token> Pagination cursor from previous response
  --status <s>     active | paused | all (default: active)

Notes:
  - list returns the raw JSON envelope. Prefer "alva automation list" for
    human-readable output or "alva automation list --json" for explicit JSON.
  - stop/resume affect future scheduled runs; existing feed data remains.
  - delete cascades to all active feed_majors in the same DB transaction.
  - delete removes producer cronjobs best-effort; the cronjob scavenger
    reconciles any leftover rows on its next sweep.
  - set-visibility publishes (public) or unpublishes (private) a feed; the
    backend sets feeds.is_public and projects the ALFS public read grant
    together. Prefer this over "alva fs grant" on the feed path, which causes
    drift.
  - Auth: caller must own the feed (uid match), enforced by the backend.

Examples:
  alva feed list
  alva feed list --status all --limit 20
  alva feed stop --id 42
  alva feed resume --id 42
  alva feed delete --id 42
  alva feed set-visibility --id 42 --visibility public
  alva feed set-visibility --id 42 --visibility private`,

  playbooks: `Usage: alva playbooks <subcommand> [options]

Find and resolve playbooks with an agent-friendly response shape.

Subcommands:
  trending        List trending playbooks
  get             Resolve playbooks by id(s) or "owner/name" ref
  list            List a user's playbooks by owner username
  set-visibility  Set a playbook's visibility (requires auth)

Get flags:
  --id <n>               Single numeric playbook id
  --ids <a,b>            Comma-separated ids (max 100); ids you cannot see
                         — and DELETED playbooks — return no row
  --ref <owner/name>     Resolve by handle

List flags:
  --owner <username>     Owner username (required)
  --limit <n>            Max results per page
  --cursor <cursor>      Pagination cursor from previous response

Trending flags:
  --keyword <text>       Search text
  --tags <a,b>           Comma-separated tags
  --tag <tag>            Single tag convenience alias
  --sort <sort>          FOLLOWS or RECENT (case-insensitive)
  --limit <n>            Max results per page
  --cursor <cursor>      Pagination cursor from previous response
  --current <cursor>     Backward-compatible cursor alias

Set-visibility flags:
  --name <name>          Playbook name (required; owner derived from auth)
  --visibility <v>       public, private, or paid (required, case-insensitive)

Output:
  trending / get / list print a readable summary (title, ref, clickable
  URL, description, tags) by default. Pass --json for the raw envelope
  (for scripting / jq).
  --json                 Emit raw JSON instead of the readable rendering

JSON response fields:
  playbooks[].ref          "username/name" identifier for agents
  playbooks[].url_path     Relative web path: /u/username/playbooks/name
  playbooks[].url          Absolute web URL: https://alva.ai/u/username/playbooks/name
  playbooks[].description  Short summary
  playbooks[].tags         Discovery tags
  playbooks[].follow_count Social proof signal
  playbooks[].cursor       Cursor for pagination
  has_next                 Whether another page exists
  playbook_path            "<owner>/<name>" echoed by set-visibility

Notes:
  private and paid are paid-tier features; free-tier accounts get a
  PERMISSION_DENIED error from the gateway.

Examples:
  alva playbooks trending --keyword scanner --tags macro,ai --sort recent --limit 5
  alva playbooks get --ids 8009,8010
  alva playbooks get --ref alice/btc-dashboard
  alva playbooks list --owner alice
  alva playbooks set-visibility --name my-scanner --visibility private
  alva playbooks set-visibility --name my-scanner --visibility public`,

  functions: `Usage: alva functions <subcommand> [options]

Register and manage playbook UDF functions. These are creator-owned functions
that released playbook HTML invokes through window.alva.udf.

Subcommands:
  register    Register or update a function on a playbook
  list        List registered functions for a playbook
  delete      Delete a registered function
  invoke      Invoke a registered function with creator/session auth
  allowance   Manage your viewer credit allowance for a playbook

Register flags:
  --playbook-id <id>          Numeric playbook id (required)
  --function-name <name>      Function name exposed to window.alva.udf (required)
  --entry-script-path <path>  Absolute ALFS path to a .js entry script (required)
  --params-schema <json>      JSON Schema object/string for parameters_json
  --params-schema-file <path> Read JSON Schema from a local file
  --allow-charges             Allow this function to charge viewer allowance
  --no-allow-charges          Explicitly register as no-charge
  --run-as-service-account <id>  Run invocations under a service-account identity
                              (id from "alva service-account create"); scopes file
                              access to the SA's grants. Omit on re-register ⇒
                              unchanged (#602)
  --clear-run-as              Clear run_as on re-register — run as the owner again
                              (mutually exclusive with --run-as-service-account)

List flags:
  --playbook-id <id>          Numeric playbook id (required)

Delete flags:
  --playbook-id <id>          Numeric playbook id (required)
  --function-name <name>      Function name to delete (required)

Invoke flags:
  --playbook-id <id>          Numeric playbook id (required)
  --function-name <name>      Function name to invoke (required)
  --params <json>             Parameters object passed as parameters_json

Allowance subcommands:
  allowance get      Get your allowance for a playbook
  allowance list     List your allowances
  allowance create   Create or update your allowance for a playbook
  allowance revoke   Revoke your allowance for a playbook

Allowance flags:
  --playbook-id <id>          Numeric playbook id (required for get/create/revoke)
  --amount <credits>          Positive integer allowance amount (required for create)

Notes:
  entry_script_path must be an absolute ALFS path under your home, such as
  /alva/home/alice/playbooks/my-playbook/udf/analyze.js. Use alva whoami to
  discover home_path. Use the browser runtime window.alva.udf for released
  playbook UI; this CLI is mainly for creator-side setup and smoke tests.
  Allowance commands use the gateway GraphQL session-user surface and reject
  playbook-scoped viewer tokens.

Examples:
  alva functions register --playbook-id 123 --function-name analyze --entry-script-path /alva/home/alice/playbooks/my-playbook/udf/analyze.js --params-schema-file ./schema.json --no-allow-charges
  alva functions list --playbook-id 123
  alva functions delete --playbook-id 123 --function-name analyze
  alva functions invoke --playbook-id 123 --function-name analyze --params '{"ticker":"AAPL"}'
  alva functions allowance create --playbook-id 123 --amount 25
  alva functions allowance get --playbook-id 123
  alva functions allowance list
  alva functions allowance revoke --playbook-id 123`,

  release: `Usage: alva release <subcommand> [options]

Publish feeds and playbooks to the Alva platform. The typical workflow:
  1. Deploy cronjob (alva deploy create)
  2. Register feed (alva release feed)
  3. Create playbook draft (alva release playbook-draft)
  4. Write HTML to ALFS (alva fs write --path ~/playbooks/{name}/index.html)
  5. Write README to ALFS (alva fs write --path ~/playbooks/{name}/README.md)
  6. Release playbook (alva release playbook --readme-url "/alva/home/<username>/playbooks/{name}/README.md")

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
  --agent-type <type>    Agent kind that produces this feed, e.g. "alpi".
                         Marks the feed as an agent feed with an editable
                         prompt (AGENTS.md). Omit for a regular feed.

Playbook-draft flags:
  --name <name>              URL-safe playbook name, unique per user (required)
  --display-name <name>      Human-readable title, max 40 chars (required)
  --feeds <json>             JSON array of {feed_id, feed_major?} (required)
  --description <text>       Playbook description
  --trading-symbols <json>   JSON array of tickers, e.g. '["BTC","ETH"]' (max 50)
  --skill-id <id>            Source-skill reference "username/name", e.g.
                             "alva/screener". Discover skills via
                             "alva skillhub list". Persisted set-once on first draft.
  --tags <json>              JSON array of discovery tags, e.g. '["btc","macro"]'
                             (max 10, each up to 32 chars). First draft merges
                             with skill tags; re-draft replaces the tag set.

Playbook flags:
  --name <name>          Playbook name, must already exist as draft (required)
  --version <version>    Semantic version, e.g. "v1.0.0" (required)
  --feeds <json>         JSON array of {feed_id, feed_major?} (required)
  --changelog <text>     Release changelog (required)
  --readme-url <url>     Owner-attested README location (required). Must be
                         the absolute ALFS path
                         "/alva/home/<username>/playbooks/<name>/README.md".
                         The README must already be written to ALFS at that
                         path before publish.
  --bypass-lint          Bypass the design-lint gate. Errors are still
                         printed on stderr — use for emergency hotfixes or
                         legacy playbook re-releases.

Display name conventions:
  Format: [subject/theme] [analysis angle/strategy logic]
  Max 40 characters. Avoid "My", "Test", or generic-only titles.
  Good: "BTC Trend Dashboard", "NVDA Insider Activity Tracker"
  Bad:  "My Dashboard", "Test V2", "Stock Dashboard"

Examples:
  alva release feed --name btc-ema --version 1.0.0 --cronjob-id 42
  alva release feed --name nvda-insiders --version 1.0.0 --cronjob-id 43 --description "NVDA insider trading activity"
  alva release feed --name market-pulse --version 1.0.0 --cronjob-id 44 --agent-type alpi
  alva release playbook-draft --name btc-dashboard --display-name "BTC Trend Dashboard" --feeds '[{"feed_id":100}]' --trading-symbols '["BTC"]'
  alva release playbook-draft --name btc-dashboard --display-name "BTC Trend Dashboard" --feeds '[{"feed_id":100}]' --skill-id alva/screener
  alva release playbook-draft --name btc-dashboard --display-name "BTC Trend Dashboard" --feeds '[{"feed_id":100}]' --tags '["btc","macro"]'
  alva release playbook --name btc-dashboard --version v1.0.0 --feeds '[{"feed_id":100}]' --changelog "Initial release" --readme-url "/alva/home/<username>/playbooks/btc-dashboard/README.md"`,

  lint: `Usage: alva lint <subcommand> [options]

Run the design-system linter against a playbook artifact. The active design
contract is fetched from the CDN (with a bundled fallback) so the linter
always runs the same rule set the platform enforces at release time.

Subcommands:
  playbook <file>    Lint a local HTML file

Playbook flags:
  --format <fmt>     Output format: "human" (default) or "json"

Exit status:
  0   No errors (warnings/info may still be present)
  1   One or more error-severity findings

Examples:
  alva lint playbook ./dist/index.html
  alva lint playbook ./dist/index.html --format json`,

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
  alva sdk doc --name "@arrays/data/widget-scrap/news:v1.0.0"
  alva sdk doc --name "@arrays/data/search/search-grok-x:v1.0.0"`,

  'data-skills': `Usage: alva data-skills <subcommand> [args]

Browse the Arrays backend's data-skill documentation. These endpoints are
public — no Alva credentials required.

Subcommands:
  list                            List all available data skills
  summary <skill>                 Get the endpoints table for a skill, plus local tier metadata
  endpoint <skill> <file>         Get full documentation and local tier metadata for a specific endpoint

Flags:
  --json             Emit raw JSON instead of the readable rendering (for scripting / jq)

Output: by default, summary/endpoint print the skill's markdown content directly,
and list prints a name → description summary. Pass --json to get the raw JSON
shape (same as before this CLI version) for piping into jq or other tools.

Global override:
  --arrays-endpoint <url>   Arrays backend URL (or ARRAYS_ENDPOINT env)
                            Default: https://data-tools.prd.space.id

Examples:
  alva data-skills list
  alva data-skills list --json
  alva data-skills summary <skill>
  alva data-skills endpoint <skill> <endpoint-file>
  alva data-skills summary <skill> --json | jq '.content'`,

  skillhub: `Usage: alva skillhub <subcommand> [options]

Browse playbook skills (system templates + user-created) from the
alva-gateway public API. Skills are namespaced as "<username>/<name>".
The "get" subcommand returns metadata + file listing; use "file" to
fetch individual file contents (progressive loading).

Subcommands:
  list       List skill summaries (filter by --tag and/or --username)
  tags       Distinct tag set used across skills
  get        Get one skill's metadata + file listing (path + size_bytes only)
  file       Get one file's content from a skill

Flags:
  --tag <tag>           (list) filter by tag
  --username <user>     (list) filter by owner username
  --json                Return raw envelope instead of pretty output

Examples:
  alva skillhub list
  alva skillhub list --tag research
  alva skillhub list --username alva
  alva skillhub tags
  alva skillhub get alva/ai-digest
  alva skillhub file alva/ai-digest README.md
  alva skillhub file alva/ai-digest references/api/example.md > out.md`,

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

  'notification-history': `Usage: alva notification-history <subcommand> [options]

Read the caller's delivered notification history scoped to a playbook or feed.
This is an audit/history surface, not a subscription toggle.

Subcommands:
  list-playbook      List notification history for a playbook
  list-feed          List notification history for a feed

Common flags:
  --username <user>  Owner's username (required)
  --name <name>      URL-safe playbook or feed name (required)
  --channel <name>   Optional delivery channel filter (telegram, web, ...)
  --status <status>  Optional status filter (sent, failed, filtered)
  --since <seconds>  Optional Unix seconds lower bound
  --first <n>        Optional page size (default 50, max 200 server-side)
  --cursor <token>   Optional cursor from the previous page

Examples:
  alva notification-history list-playbook --username alice --name btc-dashboard --first 5
  alva notification-history list-feed --username alice --name btc-ema --status sent`,

  'notification-preferences': `Usage: alva notification-preferences <subcommand>

Manage personal notification preferences. Session completed notifications are
enabled by default unless explicitly disabled.

Subcommands:
  list                         List notification preferences
  enable-session-completed     Turn on session completed notifications
  disable-session-completed    Turn off session completed notifications

Examples:
  alva notification-preferences list
  alva notification-preferences disable-session-completed
  alva notification-preferences enable-session-completed`,

  feedback: `Usage: alva feedback submit [options]

Submit user-confirmed Alva platform feedback. Agents should only call this
after the user explicitly agrees to send feedback to Alva.

Subcommands:
  submit      Send one feedback report to Alva

Submit flags:
  --summary <text>        Short issue summary (required)
  --details <text>        Additional context
  --category <category>   api_error, data_quality, docs, runtime, auth, billing, other
  --severity <severity>   low, medium, high, critical
  --source <source>       agent_detected, user_reported, system_detected
  --evidence-json <json>  Optional structured diagnostics for agents
  --context-json <json>   Optional structured session metadata for agents

Examples:
  alva feedback submit --summary "runtime failed" --category runtime --severity high
  alva feedback submit --summary "bad quote data" --category data_quality`,

  subscriptions: `Usage: alva subscriptions <subcommand> [options]

Three DISTINCT concepts share the word "subscribe" in the product:
  - FOLLOW   — the social relation (the UI's "Subscribed Playbooks").
               Enumerate with: alva subscriptions follows
  - ALERTS   — push/notification opt-ins (what list returns).
  - PURCHASE — paid playbook access / the SaaS plan. NOT this command.

Operations:
  - subscribe-playbook is a CASCADE: follows the playbook AND enables alerts
    on all its push-enabled automations (one call). unsubscribe-playbook
    reverses both and reports exactly what it changed
    ({unfollowed, wildcard_disabled}).
  - subscribe-feed / unsubscribe-feed toggle ONE feed's alert (a single
    automation) without touching the playbook follow.
  - unsubscribe disables alerts BY TARGET ID — bulk, idempotent, and the
    only way to clear ghost rows whose playbook/feed was deleted
    (name-addressed unsubscribe 404s on deleted targets).

Subcommands:
  subscribe-playbook     Subscribe a playbook (follow + enable all its alerts)
  unsubscribe-playbook   Unsubscribe a playbook (unfollow + disable its alerts)
  subscribe-feed         Enable alerts for a single feed
  unsubscribe-feed       Disable alerts for a single feed
  unsubscribe            Bulk disable alerts by target id (handles ghosts)
  list                   List the caller's active alert subscriptions
  follows                List the playbooks the caller follows

Subscribe/unsubscribe flags (playbook + feed, name-addressed):
  --username <user>      Owner's username (required)
  --name <name>          URL-safe playbook or feed name (required)

Unsubscribe (by id) flags:
  --playbook-ids <a,b>   Comma-separated playbook target ids
  --feed-ids <a,b>       Comma-separated feed target ids
                         (at least one of the two; max 100 ids total)

List flags:
  --first <n>            Optional page size (response carries total_count —
                         when items < total_count, keep paginating)
  --cursor <token>       Optional cursor from the previous page

Follows flags:
  --limit <n>            Optional page size
  --cursor <token>       Optional cursor from the previous page

List response notes:
  items[].kind           PLAYBOOK_ALERTS (playbook-level wildcard) | FEED_ALERT
  items[].following      Whether the caller also FOLLOWS the playbook
  items[].target_status  ACTIVE | TARGET_DELETED (ghost — clear via
                         unsubscribe --playbook-ids/--feed-ids) | PAUSED
  items[].playbook       {owner_username, name, display_name} for PLAYBOOK rows

Examples:
  alva subscriptions subscribe-playbook --username alice --name btc-dashboard
  alva subscriptions subscribe-feed     --username alice --name btc-ema-cross
  alva subscriptions unsubscribe --playbook-ids 8009,8010 --feed-ids 13292
  alva subscriptions list --first 200
  alva subscriptions follows`,

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

  screenshot: `Usage: alva screenshot --url <url> (--base64 | --out <file>) [--selector <css>] [--xpath <xpath>] [--full] [--compress] [--compress-quality <n>] [--compress-max-width <px>]

Capture a screenshot of an Alva page. Choose exactly one output mode.

Required:
  --url <url>                URL or path to capture (e.g. /playbook/alice/dashboard)

Output (choose one):
  --base64                   Emit the image as base64 to stdout. Compresses by
                             default (max-width 1280, quality 70) unless --full.
  --out <file>               Write the image to a local file.

Optional:
  --selector <css>           Capture a specific element by CSS selector
  --xpath <xpath>            Capture a specific element by XPath
  --full                     (--base64) Return the raw image, no default compression
  --compress                 Re-encode the image to reduce file size
  --compress-quality <n>     Compression quality 1-100
  --compress-max-width <px>  Downscale to at most this width in pixels

Examples:
  alva screenshot --url /playbook/alice/dashboard --base64
  alva screenshot --url /playbook/alice/dashboard --out dashboard.png
  alva screenshot --url /playbook/alice/dashboard --out chart.png --selector ".chart-container"`,

  portfolio: `Usage: alva portfolio <subcommand> [options]

Read-only view of connected accounts across TREX and SnapTrade.
For trading actions (subscribe, execute, etc.) use 'alva trading'.

Subcommands:
  accounts     List all connected accounts (TREX + SnapTrade)
  summary      Get portfolio summary (holdings + balance) for an account
  activities   List recent activity for an account

Summary/Activities flags:
  --account-id <id>    Account ID with provider prefix, e.g. trex:123 or snaptrade:456 (required)

Activities optional flags:
  --limit <n>          Max results (default 50, max 200)
  --page-token <tok>   Pagination token from a previous response

Examples:
  alva portfolio accounts
  alva portfolio summary --account-id trex:123
  alva portfolio activities --account-id snaptrade:456 --limit 20`,

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

export type AlvaCliRuntimeMode = 'nodejs' | 'jagent';

export interface DispatchRuntimeDeps {
  mode?: AlvaCliRuntimeMode;
  env?: Record<string, string | undefined>;
  stderr?: Pick<typeof process.stderr, 'write'>;
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

export const BOOLEAN_FLAGS = new Set([
  'recursive',
  'mkdir-parents',
  'push-notify',
  'help',
  'execute-latest',
  'dry-run',
  'allow-charges',
  'clear-run-as',
  'json',
  'compress',
  'bypass-lint',
  'no-browser',
  'browser',
  'base64',
  'full',
  'today',
]);

export function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) {
      flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      continue;
    }

    const name = arg.slice(2);

    // Literal boolean flag wins over the --no-X shortcut. This matters
    // for flags whose own name starts with "no-" (e.g. --no-browser is
    // itself a boolean opt-in, NOT the negation of --browser).
    if (BOOLEAN_FLAGS.has(name)) {
      flags[name] = 'true';
      continue;
    }

    // --no-X shortcut: only when X is a known boolean flag AND there is
    // no literal --no-X flag registered (handled above).
    if (name.startsWith('no-') && BOOLEAN_FLAGS.has(name.slice(3))) {
      flags[name.slice(3)] = 'false';
      continue;
    }

    // Non-boolean flag: requires a value. Two failure modes both
    // silently fell back to defaults before, which masked footguns
    // like `--base-url` at end-of-line (multi-line shell command with
    // a stray newline) or `--api-key --profile staging`:
    //   1. no next arg at all
    //   2. next arg looks like another flag (`--something`)
    // Treat both as a usage error — the user almost certainly meant to
    // pass a value.
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new CliUsageError(
        `--${name} requires a value`,
        // Group is best-effort: first non-flag arg of the original
        // argv. parseFlags doesn't track group, so just use the flag
        // name as a fallback hint.
        name
      );
    }
    flags[name] = next;
    i++;
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

function requirePositiveIntegerFlag(
  flags: Record<string, string>,
  name: string,
  command: string
): number {
  const val = requireFlag(flags, name, command);
  if (!/^[1-9]\d*$/.test(val)) {
    const group = command.split(' ')[0];
    throw new CliUsageError(
      `--${name} must be a positive integer for '${command}', got '${val}'`,
      group
    );
  }
  return Number(val);
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

function optionalBoundedIntegerFlag(
  flags: Record<string, string>,
  name: string,
  command: string,
  min: number,
  max: number
): number | undefined {
  const val = flags[name];
  if (val === undefined) return undefined;
  const n = Number(val);
  if (!Number.isInteger(n) || n < min || n > max) {
    const group = command.split(' ')[0];
    throw new CliUsageError(
      `--${name} must be an integer between ${min} and ${max} for '${command}', got '${val}'`,
      group
    );
  }
  return n;
}

// Validate an optional service-account id flag (--run-as-service-account).
// Returns undefined when absent, but THROWS on a non-positive / non-integer
// value instead of silently dropping it: this is a security-sensitive flag, and
// a typo (e.g. `90123x` or `=`) must NOT fail open and run the job with the
// owner's full privileges instead of the scoped SA (#602, Codex P1).
//
// The id is kept as a STRING, not parsed to a number: user ids are snowflake
// int64s that routinely exceed Number.MAX_SAFE_INTEGER, so coercing to a JS
// number would round a valid id (or reject it under a MAX_SAFE_INTEGER bound),
// making real service accounts unusable as run-as targets (Codex P2).
function optionalServiceAccountIdFlag(
  flags: Record<string, string>,
  command: string
): string | undefined {
  const raw = flags['run-as-service-account'];
  if (raw === undefined) return undefined;
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new CliUsageError(
      `--run-as-service-account must be a positive service-account id for '${command}', got '${raw}'`,
      command.split(' ')[0]
    );
  }
  return raw;
}

// Resolve the run_as field for create/update/register from its two flags:
//   --run-as-service-account <id>  → set/switch to that SA (validated > 0)
//   --clear-run-as                 → clear it (send "0"; backend runs as owner)
//   neither                        → undefined (omitted): backend PRESERVES the
//                                    prior run_as on re-registration/update.
// The two flags are mutually exclusive. We keep clearing on an explicit
// --clear-run-as rather than accepting `--run-as-service-account 0`, so a typo'd
// empty value still throws instead of silently un-scoping the job (#602). The
// returned value is a string (snowflake-safe id, or "0" to clear).
function resolveRunAsFlag(
  flags: Record<string, string>,
  command: string
): string | undefined {
  const clear = boolFlag(flags['clear-run-as']) ?? false;
  const setID = optionalServiceAccountIdFlag(flags, command);
  if (clear && setID !== undefined) {
    throw new CliUsageError(
      `--clear-run-as and --run-as-service-account are mutually exclusive for '${command}'`,
      command.split(' ')[0]
    );
  }
  if (clear) return '0';
  return setID;
}

// Require a service-account id flag (--id) as a snowflake-safe string. Like
// optionalServiceAccountIdFlag but mandatory (grant/revoke/delete): SA ids are
// int64 snowflakes, so validate the shape and keep the string rather than
// parsing to a number, which would round a large id.
function requireServiceAccountIdFlag(
  flags: Record<string, string>,
  command: string
): string {
  const raw = flags['id'];
  if (raw === undefined || raw === '') {
    throw new CliUsageError(
      `Missing required flag --id for '${command}'`,
      command.split(' ')[0]
    );
  }
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new CliUsageError(
      `--id must be a positive service-account id for '${command}', got '${raw}'`,
      command.split(' ')[0]
    );
  }
  return raw;
}

function parsePositiveIntegerValue(
  val: string,
  label: string,
  command: string
): number {
  const n = Number(val);
  if (!/^[1-9]\d*$/.test(val) || !Number.isSafeInteger(n)) {
    const group = command.split(' ')[0];
    throw new CliUsageError(
      `${label} must be a positive integer for '${command}', got '${val}'`,
      group
    );
  }
  return n;
}

function runtimeEnv(
  deps?: DispatchRuntimeDeps
): Record<string, string | undefined> {
  return deps?.env ?? (process.env as Record<string, string | undefined>);
}

function runTimeoutMs(
  flags: Record<string, string>,
  deps?: DispatchRuntimeDeps
): number {
  if (flags['timeout-ms'] !== undefined) {
    return parsePositiveIntegerValue(
      flags['timeout-ms'],
      '--timeout-ms',
      'run'
    );
  }
  const envValue = runtimeEnv(deps)[RUN_TIMEOUT_ENV];
  if (envValue !== undefined && envValue !== '') {
    return parsePositiveIntegerValue(envValue, RUN_TIMEOUT_ENV, 'run');
  }
  return DEFAULT_RUN_TIMEOUT_MS;
}

function configureRunFetchTimeout(
  timeoutMs: number,
  deps?: DispatchRuntimeDeps
): void {
  if (deps?.mode === 'jagent') return;
  if (configuredRunFetchTimeoutMs === timeoutMs) return;
  setGlobalDispatcher(
    new Agent({
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    })
  );
  configuredRunFetchTimeoutMs = timeoutMs;
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

function csvList(val: string | undefined): string[] | undefined {
  if (val === undefined) return undefined;
  const values = val
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function parseOwnerNameTarget(
  value: string,
  flag: string,
  command: string
): { username: string; name: string } {
  const [username, ...rest] = value.split('/');
  const name = rest.join('/');
  if (!username || !name || name.includes('/')) {
    throw new CliUsageError(
      `--${flag} must be in owner/name form for '${command}', got '${value}'`,
      command.split(' ')[0]
    );
  }
  return { username, name };
}

function requireSingleAlertTarget(
  flags: Record<string, string>,
  command: string
): {
  kind: 'automation' | 'playbook';
  target: { username: string; name: string };
} {
  const automation = flags['automation'];
  const playbook = flags['playbook'];
  if ((automation ? 1 : 0) + (playbook ? 1 : 0) !== 1) {
    throw new CliUsageError(
      `Provide exactly one of --automation or --playbook for '${command}'`,
      'alert'
    );
  }
  if (automation) {
    return {
      kind: 'automation',
      target: parseOwnerNameTarget(automation, 'automation', command),
    };
  }
  return {
    kind: 'playbook',
    target: parseOwnerNameTarget(playbook!, 'playbook', command),
  };
}

function feedReleaseParams(flags: Record<string, string>, command: string) {
  return {
    name: requireFlag(flags, 'name', command),
    version: requireFlag(flags, 'version', command),
    cronjob_id: requireNumericFlag(flags, 'cronjob-id', command),
    view_json: jsonParse(flags['view-json']) as
      | Record<string, unknown>
      | undefined,
    description: flags['description'],
    changelog: flags['changelog'],
    agent_type: flags['agent-type'],
  };
}

function trendingPlaybooksSort(
  val: string | undefined
): 'FOLLOWS' | 'RECENT' | undefined {
  if (val === undefined) return undefined;
  const normalized = val.trim().toUpperCase();
  if (normalized === 'FOLLOWS' || normalized === 'RECENT') return normalized;
  throw new CliUsageError(
    `--sort must be FOLLOWS or RECENT for 'playbooks trending', got '${val}'`,
    'playbooks'
  );
}

function playbookVisibility(val: string): PlaybookVisibility {
  const normalized = val.trim().toLowerCase();
  if ((PLAYBOOK_VISIBILITIES as readonly string[]).includes(normalized)) {
    return normalized as PlaybookVisibility;
  }
  throw new CliUsageError(
    `--visibility must be one of ${PLAYBOOK_VISIBILITIES.join(', ')} for 'playbooks set-visibility', got '${val}'`,
    'playbooks'
  );
}

function feedVisibility(val: string): 'public' | 'private' {
  const normalized = val.trim().toLowerCase();
  if (normalized === 'public' || normalized === 'private') {
    return normalized;
  }
  throw new CliUsageError(
    `--visibility must be one of public, private for 'feed set-visibility', got '${val}'`,
    'feed'
  );
}

function parseCreditsTimestamp(
  value: string,
  flag: string,
  command: string
): number {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const ms = Number(trimmed);
    if (Number.isSafeInteger(ms)) return ms;
  }

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T00:00:00Z`
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(trimmed)
      ? `${trimmed}Z`
      : trimmed;
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) {
    throw new CliUsageError(
      `--${flag} must be an ISO time, YYYY-MM-DD, or Unix ms for '${command}', got '${value}'`,
      command.split(' ')[0]
    );
  }
  return parsed;
}

function parseCreditsDurationMs(value: string): number {
  const match = /^([1-9]\d*)([mhd])$/.exec(value.trim().toLowerCase());
  if (!match) {
    throw new CliUsageError(
      `--last must be a positive duration like 30m, 24h, or 7d for 'credits items', got '${value}'`,
      'credits'
    );
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier =
    unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  const durationMs = amount * multiplier;
  if (!Number.isSafeInteger(durationMs)) {
    throw new CliUsageError(
      `--last duration is too large for 'credits items', got '${value}'`,
      'credits'
    );
  }
  return durationMs;
}

// The per-user loop-runner: one shared script serves every one of a user's
// loops. It reads its goal/channel from the cronjob's args (require('env').args)
// and dispatches a fire-and-forget turn via @alva/loop. Home-relative — the
// gateway resolves it against the caller's home, so no username is needed here.
const LOOP_RUNNER_PATH = '~/loops/_runner/index.js';
const LOOP_RUNNER_SRC = [
  "const { loop } = require('@alva/loop');",
  "const { goal, channelId } = require('env').args;",
  'loop(goal, channelId ? { channelId } : {});',
  '',
].join('\n');

// parseExpiresInToEndAt converts a relative --expires-in (30m|24h|7d, default
// 7d, or 'never') into an absolute RFC3339 end_at for the cronjob's lifetime
// ceiling. 'never' ⇒ undefined (no ceiling — unbounded, discouraged). The
// client clock is fine here: skew is negligible against a multi-day lifetime.
function parseExpiresInToEndAt(
  value: string | undefined,
  command: string
): string | undefined {
  const raw = (value ?? '7d').trim().toLowerCase();
  if (raw === 'never') return undefined;
  const match = /^([1-9]\d*)([mhd])$/.exec(raw);
  if (!match) {
    throw new CliUsageError(
      `--expires-in must be a positive duration like 30m, 24h, 7d, or 'never', got '${value}'`,
      command.split(' ')[0]
    );
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const durationMs =
    amount * (unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000);
  if (!Number.isSafeInteger(durationMs)) {
    throw new CliUsageError(
      `--expires-in is too large, got '${value}'`,
      command.split(' ')[0]
    );
  }
  return new Date(Date.now() + durationMs).toISOString();
}

// loopCronjobName derives a valid cronjob name (1-63 lowercase alphanumeric or
// hyphens, no leading/trailing hyphen) from the goal, unless --name is given.
function loopCronjobName(flags: Record<string, string>, goal: string): string {
  if (flags['name'] !== undefined) return flags['name']; // backend validates
  const base = goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const slug = (base ? `loop-${base}` : 'loop')
    .slice(0, 63)
    .replace(/-+$/g, '');
  return slug || 'loop';
}

function parseCreditsItemsParams(flags: Record<string, string>): {
  startAtMs: number;
  endAtMs: number;
  sessionId?: string;
  first?: number;
  after?: string;
} {
  const command = 'credits items';
  const hasToday = boolFlag(flags['today']) === true;
  const hasLast = flags['last'] !== undefined;
  const hasStart = flags['start'] !== undefined;
  const hasEnd = flags['end'] !== undefined;
  const windowCount =
    (hasToday ? 1 : 0) + (hasLast ? 1 : 0) + (hasStart || hasEnd ? 1 : 0);

  if (windowCount !== 1) {
    throw new CliUsageError(
      "Choose exactly one window for 'credits items': --today, --last, or --start with --end",
      'credits'
    );
  }
  if (hasStart !== hasEnd) {
    throw new CliUsageError(
      "--start and --end must be provided together for 'credits items'",
      'credits'
    );
  }

  let startAtMs: number;
  let endAtMs: number;
  if (hasToday) {
    const now = new Date();
    startAtMs = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    );
    endAtMs = startAtMs + 86_400_000;
  } else if (hasLast) {
    const durationMs = parseCreditsDurationMs(flags['last']!);
    endAtMs = Date.now();
    startAtMs = endAtMs - durationMs;
  } else {
    startAtMs = parseCreditsTimestamp(flags['start']!, 'start', command);
    endAtMs = parseCreditsTimestamp(flags['end']!, 'end', command);
  }

  if (endAtMs <= startAtMs) {
    throw new CliUsageError(
      "--end must be greater than --start for 'credits items'",
      'credits'
    );
  }

  return {
    startAtMs,
    endAtMs,
    sessionId: flags['session-id'],
    first: optionalBoundedIntegerFlag(flags, 'first', command, 1, 500),
    after: flags['after'],
  };
}

function jsonParse(val: string | undefined): unknown {
  if (val === undefined) return undefined;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
}

function jsonObjectFlag(
  flags: Record<string, string>,
  name: string,
  command: string
): Record<string, unknown> | undefined {
  const raw = flags[name];
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CliUsageError(
      `--${name} must be valid JSON for '${command}'`,
      command.split(' ')[0]
    );
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new CliUsageError(
      `--${name} must be a JSON object for '${command}'`,
      command.split(' ')[0]
    );
  }
  return parsed as Record<string, unknown>;
}

function jsonRequiredFlag(
  flags: Record<string, string>,
  name: string,
  command: string
): unknown {
  const raw = requireFlag(flags, name, command);
  try {
    return JSON.parse(raw);
  } catch {
    throw new CliUsageError(
      `--${name} must be valid JSON for '${command}'`,
      command.split(' ')[0]
    );
  }
}

function jsonSchemaStringFlag(
  flags: Record<string, string>,
  command: string,
  deps?: DispatchRuntimeDeps
): string | undefined {
  const inlineSchema = flags['params-schema'];
  const schemaFile = flags['params-schema-file'];
  if (inlineSchema !== undefined && schemaFile !== undefined) {
    throw new CliUsageError(
      '--params-schema and --params-schema-file are mutually exclusive',
      command.split(' ')[0]
    );
  }
  const raw =
    schemaFile !== undefined
      ? readLocalTextFile(schemaFile, command, 'params-schema-file', deps)
      : inlineSchema;
  if (raw === undefined) return undefined;
  try {
    JSON.parse(raw);
  } catch {
    const flag =
      schemaFile !== undefined ? 'params-schema-file' : 'params-schema';
    throw new CliUsageError(
      `--${flag} must contain valid JSON for '${command}'`,
      command.split(' ')[0]
    );
  }
  return raw;
}

function localFileUnsupported(command: string, flag: string): CliUsageError {
  return new CliUsageError(
    `--${flag} reads or writes a local file, which is unavailable in jagent. ` +
      `Use ALFS-native read/write/edit tools first, then pass ALFS paths or inline data to '${command}'.`,
    command.split(' ')[0]
  );
}

function assertLocalFileAvailable(
  command: string,
  flag: string,
  deps?: DispatchRuntimeDeps
): void {
  if (deps?.mode === 'jagent') {
    throw localFileUnsupported(command, flag);
  }
}

function readLocalTextFile(
  path: string,
  command: string,
  flag: string,
  deps?: DispatchRuntimeDeps
): string {
  assertLocalFileAvailable(command, flag, deps);
  return fs.readFileSync(path, 'utf-8');
}

function readLocalFileBytes(
  path: string,
  command: string,
  flag: string,
  deps?: DispatchRuntimeDeps
): BodyInit {
  assertLocalFileAvailable(command, flag, deps);
  return fs.readFileSync(path) as unknown as BodyInit;
}

function sniffImageMime(bytes: Uint8Array | Buffer): string {
  const b = bytes;
  if (
    b.length >= 4 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47
  ) {
    return 'image/png';
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return 'image/webp';
  }
  return 'image/png';
}

function writeLocalFileBytes(
  path: string,
  data: Uint8Array,
  command: string,
  flag: string,
  deps?: DispatchRuntimeDeps
): void {
  assertLocalFileAvailable(command, flag, deps);
  fs.writeFileSync(path, data);
}

/** Read all of stdin as a UTF-8 string (for `broker order place --stdin`). */
async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * `alva broker` — a thin passthrough to trex's BrokerService.Invoke via the
 * gateway. argv goes through untouched (the command grammar IS the contract:
 * `alva broker describe`); the envelope comes back and is written to stdout
 * verbatim, the process exits with its exit code. No DTO, no per-command
 * knowledge — with ONE exception: a live `order place` gets a client-minted
 * `--intent-id` (printed to stderr BEFORE the request) so the idempotency
 * retry handle survives even if this process dies before the response
 * arrives (design §2.5.1 / §2.6).
 */
async function handleBroker(
  client: AlvaClient,
  brokerArgv: string[],
  deps?: DispatchRuntimeDeps
): Promise<unknown> {
  let argv = brokerArgv;
  const isOrderPlace = brokerArgv[0] === 'order' && brokerArgv[1] === 'place';
  // Detect a retry handle in either form: `--intent-id x` or `--intent-id=x`
  // (same for --client-order-id). Missing the equals-form would append a
  // SECOND minted handle and break the idempotency key the operator intended.
  const hasFlag = (name: string): boolean =>
    brokerArgv.some((a) => a === name || a.startsWith(`${name}=`));
  const hasHandle = hasFlag('--intent-id') || hasFlag('--client-order-id');
  const isDryRun = hasFlag('--dry-run');
  if (isOrderPlace && !hasHandle && !isDryRun) {
    const intentId = crypto.randomUUID();
    // stderr BEFORE the request: if we die mid-flight, the operator still has
    // the retry handle. stdout stays the pure JSON envelope.
    process.stderr.write(`alva broker: intent-id ${intentId}\n`);
    argv = [...brokerArgv, '--intent-id', intentId];
  }

  let stdin: string | undefined;
  if (hasFlag('--stdin')) {
    stdin = await readAllStdin();
  }

  let envelope: unknown;
  let exit = 2;
  try {
    const resp = (await client._request('POST', '/api/v1/broker/invoke', {
      body: { argv, stdin },
    })) as { envelope: unknown; exit: number };
    envelope = resp.envelope;
    exit = resp.exit ?? 2;
  } catch (e) {
    // Transport failure: synthesize a contract-shaped error envelope so the
    // agent's stdout parse never breaks; exit 2 = unknown outcome.
    const message = e instanceof Error ? e.message : String(e);
    envelope = {
      schemaVersion: 2,
      status: 'error',
      reason: { code: 'network', message },
    };
    exit = 2;
  }

  if (deps?.mode === 'jagent') {
    // Programmatic callers get the envelope regardless of outcome; the exit
    // code is encoded in the envelope's status, so returning it (not throwing)
    // preserves the full contract for the caller to inspect.
    return envelope;
  }
  // Exit only AFTER stdout has flushed — process.exit() right after write()
  // can truncate on a pipe (agents pipe stdout), corrupting the envelope. The
  // write callback fires once the data is handed to the OS.
  await new Promise<void>((resolve) => {
    process.stdout.write(JSON.stringify(envelope) + '\n', () => resolve());
  });
  process.exit(exit);
}

export async function dispatch(
  client: AlvaClient,
  args: string[],
  meta?: { profile?: string; baseUrl?: string; cliVersion?: string },
  deps?: DispatchRuntimeDeps
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

  // broker is a raw argv passthrough — it must NOT go through parseFlags
  // (which would reject broker-native valueless flags like --stdin and any
  // future flag toolkit doesn't know about). Intercept before parsing.
  if (group === 'broker') {
    return handleBroker(client, args.slice(1), deps);
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
            const fileData = readLocalFileBytes(
              flags['file'],
              'fs write',
              'file',
              deps
            );
            return client.fs.rawWrite({
              path: requireFlag(flags, 'path', 'fs write'),
              body: fileData,
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
        code = readLocalTextFile(
          flags['local-file'],
          'run',
          'local-file',
          deps
        );
      }
      const timeout_ms = runTimeoutMs(flags, deps);
      configureRunFetchTimeout(timeout_ms, deps);
      return client.run.execute({
        code,
        entry_path: flags['entry-path'],
        working_dir: flags['working-dir'],
        args: jsonParse(flags['args']) as Record<string, unknown> | undefined,
        max_heap_size_mb: optionalBoundedIntegerFlag(
          flags,
          'max-heap-size-mb',
          'run',
          1,
          2048
        ),
        timeout_ms,
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
            max_heap_size_mb: optionalBoundedIntegerFlag(
              flags,
              'max-heap-size-mb',
              'deploy create',
              1,
              2046
            ),
            run_as_user_id: optionalServiceAccountIdFlag(
              flags,
              'deploy create'
            ),
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
            max_heap_size_mb: optionalBoundedIntegerFlag(
              flags,
              'max-heap-size-mb',
              'deploy update',
              1,
              2046
            ),
            run_as_user_id: resolveRunAsFlag(flags, 'deploy update'),
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
            cursor: flags['cursor'],
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

    case 'loop': {
      if (!subcommand)
        throw new CliUsageError('Missing subcommand for loop', 'loop');
      switch (subcommand) {
        case 'create': {
          const goal = requireFlag(flags, 'goal', 'loop create');
          const cron = requireFlag(flags, 'cron', 'loop create');
          const channelId = flags['channel-id'];
          const endAt = parseExpiresInToEndAt(
            flags['expires-in'],
            'loop create'
          );
          // Seed the shared loop-runner first (idempotent — stable content).
          // Aborting here beats creating a cron that points at a missing script.
          await client.fs.write({
            path: LOOP_RUNNER_PATH,
            data: LOOP_RUNNER_SRC,
            mkdir_parents: true,
          });
          return client.deploy.create({
            name: loopCronjobName(flags, goal),
            path: LOOP_RUNNER_PATH,
            cron_expression: cron,
            args: channelId ? { goal, channelId } : { goal },
            end_at: endAt,
          });
        }
        default:
          throw new CliUsageError(
            `Unknown subcommand: loop ${subcommand}`,
            'loop'
          );
      }
    }

    case 'service-account': {
      if (!subcommand)
        throw new CliUsageError(
          'Missing subcommand for service-account',
          'service-account'
        );
      switch (subcommand) {
        case 'create':
          return client.serviceAccount.create({
            display_name: requireFlag(flags, 'name', 'service-account create'),
          });
        case 'list':
          return client.serviceAccount.list();
        case 'delete':
          return client.serviceAccount.delete({
            id: requireServiceAccountIdFlag(flags, 'service-account delete'),
          });
        case 'grant':
          return client.serviceAccount.grant({
            id: requireServiceAccountIdFlag(flags, 'service-account grant'),
            path: requireFlag(flags, 'path', 'service-account grant'),
            permission: requireFlag(
              flags,
              'permission',
              'service-account grant'
            ),
          });
        case 'revoke':
          return client.serviceAccount.revoke({
            id: requireServiceAccountIdFlag(flags, 'service-account revoke'),
            path: requireFlag(flags, 'path', 'service-account revoke'),
            permission: requireFlag(
              flags,
              'permission',
              'service-account revoke'
            ),
          });
        default:
          throw new CliUsageError(
            `Unknown subcommand: service-account ${subcommand}`,
            'service-account'
          );
      }
    }

    case 'feed': {
      if (!subcommand)
        throw new CliUsageError('Missing subcommand for feed', 'feed');
      switch (subcommand) {
        case 'list':
          return client.feed.list({
            limit: num(flags['limit']),
            cursor: flags['cursor'],
            status: flags['status'] as 'active' | 'paused' | 'all' | undefined,
          });
        case 'stop':
          return client.feed.stop({
            id: requireNumericFlag(flags, 'id', 'feed stop'),
          });
        case 'resume':
          return client.feed.resume({
            id: requireNumericFlag(flags, 'id', 'feed resume'),
          });
        case 'delete':
          return client.feed.delete({
            id: requireNumericFlag(flags, 'id', 'feed delete'),
          });
        case 'set-visibility':
          return client.feed.setVisibility({
            id: requireNumericFlag(flags, 'id', 'feed set-visibility'),
            visibility: feedVisibility(
              requireFlag(flags, 'visibility', 'feed set-visibility')
            ),
          });
        default:
          throw new CliUsageError(
            `Unknown subcommand: feed ${subcommand}`,
            'feed'
          );
      }
    }

    case 'automation': {
      if (!subcommand)
        throw new CliUsageError(
          'Missing subcommand for automation',
          'automation'
        );
      switch (subcommand) {
        case 'list': {
          const result = await client.automation.list({
            limit: num(flags['limit']),
            cursor: flags['cursor'],
            status: flags['status'] as 'active' | 'paused' | 'all' | undefined,
          });
          return boolFlag(flags['json'])
            ? result
            : formatAutomationList(result);
        }
        case 'inspect': {
          const result = await client.automation.inspect({
            id: requireNumericFlag(flags, 'id', 'automation inspect'),
          });
          return boolFlag(flags['json'])
            ? result
            : formatAutomationDetail(result);
        }
        case 'publish':
          return client.automation.publish(
            feedReleaseParams(flags, 'automation publish')
          );
        case 'stop':
          return client.automation.stop({
            id: requireNumericFlag(flags, 'id', 'automation stop'),
          });
        case 'resume':
          return client.automation.resume({
            id: requireNumericFlag(flags, 'id', 'automation resume'),
          });
        case 'delete':
          return client.automation.delete({
            id: requireNumericFlag(flags, 'id', 'automation delete'),
          });
        default:
          throw new CliUsageError(
            `Unknown subcommand: automation ${subcommand}`,
            'automation'
          );
      }
    }

    case 'credits': {
      if (!subcommand)
        throw new CliUsageError('Missing subcommand for credits', 'credits');
      switch (subcommand) {
        case 'wallet':
          return client.credits.wallet();
        case 'items':
          return client.credits.items(parseCreditsItemsParams(flags));
        default:
          throw new CliUsageError(
            `Unknown subcommand: credits ${subcommand}`,
            'credits'
          );
      }
    }

    case 'playbooks': {
      if (!subcommand)
        throw new CliUsageError(
          'Missing subcommand for playbooks',
          'playbooks'
        );
      const asJson = boolFlag(flags['json']) ?? false;
      const webOrigin = webOriginFromApiBase(client.baseUrl);
      switch (subcommand) {
        case 'trending': {
          const result = await client.playbooks.trending({
            keyword: flags['keyword'],
            tags: csvList(flags['tags'] ?? flags['tag']),
            sort: trendingPlaybooksSort(flags['sort']),
            limit: num(flags['limit']),
            cursor: flags['cursor'],
            current: flags['current'],
          });
          return asJson ? result : formatTrendingPlaybooks(result);
        }
        case 'set-visibility':
          return client.playbooks.setVisibility({
            name: requireFlag(flags, 'name', 'playbooks set-visibility'),
            visibility: playbookVisibility(
              requireFlag(flags, 'visibility', 'playbooks set-visibility')
            ),
          });
        case 'get': {
          const ids = csvList(flags['ids']);
          if (ids && ids.length > 0) {
            const result = await client.playbooks.getByIds(ids);
            return asJson
              ? result
              : formatPlaybookList(result.items, webOrigin);
          }
          if (flags['id'] || flags['ref']) {
            const result = await client.playbooks.get({
              id: flags['id'],
              ref: flags['ref'],
            });
            return asJson ? result : formatPlaybook(result, webOrigin);
          }
          throw new CliUsageError(
            '--id, --ids or --ref is required',
            'playbooks'
          );
        }
        case 'list': {
          const result = await client.playbooks.listByOwner({
            owner: requireFlag(flags, 'owner', 'playbooks list'),
            limit: num(flags['limit']),
            cursor: flags['cursor'],
          });
          return asJson
            ? result
            : formatPlaybookList(result.items, webOrigin, {
                hasNext: result.has_next,
              });
        }
        default:
          throw new CliUsageError(
            `Unknown subcommand: playbooks ${subcommand}`,
            'playbooks'
          );
      }
    }

    case 'functions': {
      if (!subcommand)
        throw new CliUsageError(
          'Missing subcommand for functions',
          'functions'
        );
      switch (subcommand) {
        case 'allowance': {
          const leaf = args[2];
          if (!leaf || leaf === '--help' || leaf === '-h') {
            return { _help: true, text: COMMAND_HELP.functions };
          }
          switch (leaf) {
            case 'get':
              return client.functions.getAllowance({
                playbook_id: requireNumericFlag(
                  flags,
                  'playbook-id',
                  'functions allowance get'
                ),
              });
            case 'list':
              return client.functions.listAllowances();
            case 'create':
              return client.functions.createAllowance({
                playbook_id: requireNumericFlag(
                  flags,
                  'playbook-id',
                  'functions allowance create'
                ),
                amount: requirePositiveIntegerFlag(
                  flags,
                  'amount',
                  'functions allowance create'
                ),
              });
            case 'revoke':
              return client.functions.revokeAllowance({
                playbook_id: requireNumericFlag(
                  flags,
                  'playbook-id',
                  'functions allowance revoke'
                ),
              });
            default:
              throw new CliUsageError(
                `Unknown subcommand: functions allowance ${leaf}`,
                'functions'
              );
          }
        }
        case 'register':
          return client.functions.register({
            playbook_id: requireNumericFlag(
              flags,
              'playbook-id',
              'functions register'
            ),
            function_name: requireFlag(
              flags,
              'function-name',
              'functions register'
            ),
            entry_script_path: requireFlag(
              flags,
              'entry-script-path',
              'functions register'
            ),
            params_schema: jsonSchemaStringFlag(
              flags,
              'functions register',
              deps
            ),
            allow_charges: boolFlag(flags['allow-charges']),
            run_as_user_id: resolveRunAsFlag(flags, 'functions register'),
          });
        case 'list':
          return client.functions.list({
            playbook_id: requireNumericFlag(
              flags,
              'playbook-id',
              'functions list'
            ),
          });
        case 'delete':
          return client.functions.delete({
            playbook_id: requireNumericFlag(
              flags,
              'playbook-id',
              'functions delete'
            ),
            function_name: requireFlag(
              flags,
              'function-name',
              'functions delete'
            ),
          });
        case 'invoke':
          return client.functions.invoke({
            playbook_id: requireNumericFlag(
              flags,
              'playbook-id',
              'functions invoke'
            ),
            function_name: requireFlag(
              flags,
              'function-name',
              'functions invoke'
            ),
            parameters:
              flags['params'] === undefined
                ? undefined
                : jsonRequiredFlag(flags, 'params', 'functions invoke'),
          });
        default:
          throw new CliUsageError(
            `Unknown subcommand: functions ${subcommand}`,
            'functions'
          );
      }
    }

    case 'release': {
      if (!subcommand)
        throw new CliUsageError('Missing subcommand for release', 'release');
      switch (subcommand) {
        case 'feed':
          return client.release.feed(feedReleaseParams(flags, 'release feed'));
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
            skill_id: flags['skill-id'],
            tags: flags['tags']
              ? (jsonParse(flags['tags']) as string[])
              : undefined,
          });
        case 'playbook': {
          // Validate all required flags up front so usage errors surface
          // before any network/lint work runs.
          const name = requireFlag(flags, 'name', 'release playbook');
          const version = requireFlag(flags, 'version', 'release playbook');
          const feedsRaw = requireFlag(flags, 'feeds', 'release playbook');
          const changelog = requireFlag(flags, 'changelog', 'release playbook');
          const readmeUrl = requireFlag(
            flags,
            'readme-url',
            'release playbook'
          );
          const bypassLint = boolFlag(flags['bypass-lint']) ?? false;
          const { lintBeforeRelease } = await import('./lint.js');
          const lintReport = await lintBeforeRelease({
            client,
            playbookName: name,
            bypassLint,
          });
          if (lintReport.summary.warnings > 0) {
            const { formatReport } = await import('../lint/report.js');
            (deps?.stderr ?? process.stderr).write(
              'design lint warnings:\n' +
                formatReport(lintReport, 'human') +
                '\n'
            );
          }
          return client.release.playbook({
            name,
            version,
            feeds: jsonParse(feedsRaw) as Array<{
              feed_id: number;
              feed_major?: number;
            }>,
            changelog,
            readme_url: readmeUrl,
          });
        }
        default:
          throw new CliUsageError(
            `Unknown subcommand: release ${subcommand}`,
            'release'
          );
      }
    }

    case 'lint': {
      if (subcommand !== 'playbook') {
        throw new CliUsageError(
          'Usage: alva lint playbook <file> [--format json|human]',
          'lint'
        );
      }
      const file = args[2];
      if (!file || file.startsWith('--')) {
        throw new CliUsageError(
          'Missing file argument for lint playbook',
          'lint'
        );
      }
      const formatFlag = flags['format'];
      if (
        formatFlag !== undefined &&
        formatFlag !== 'human' &&
        formatFlag !== 'json'
      ) {
        throw new CliUsageError(
          `Invalid --format value: ${formatFlag} (expected 'human' or 'json')`,
          'lint'
        );
      }
      const format = (formatFlag as 'human' | 'json' | undefined) ?? 'human';
      const { handleLintPlaybook } = await import('./lint.js');
      const { exitCode, output } = await handleLintPlaybook({
        file,
        format,
        client: deps?.mode === 'jagent' ? client : undefined,
      });
      if (deps?.mode === 'jagent') {
        if (exitCode !== 0) throw new Error(output);
        return output;
      }
      process.stdout.write(output + (output.endsWith('\n') ? '' : '\n'));
      if (exitCode !== 0) process.exit(exitCode);
      return undefined;
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

    case 'data-skills': {
      if (!subcommand)
        throw new CliUsageError(
          'Missing subcommand for data-skills',
          'data-skills'
        );
      const asJson = boolFlag(flags['json']) ?? false;
      switch (subcommand) {
        case 'list': {
          const result = await client.dataSkills.list();
          return asJson ? result : formatSkillsList(result);
        }
        case 'summary': {
          const name = args[2];
          if (!name || name.startsWith('--')) {
            throw new CliUsageError(
              'Missing skill name for data-skills summary',
              'data-skills'
            );
          }
          const result = await client.dataSkills.summary({ name });
          return asJson ? result : formatSkillSummary(result);
        }
        case 'endpoint': {
          const name = args[2];
          if (!name || name.startsWith('--')) {
            throw new CliUsageError(
              'Missing skill name for data-skills endpoint',
              'data-skills'
            );
          }
          const file = args[3];
          if (!file || file.startsWith('--')) {
            throw new CliUsageError(
              'Missing endpoint file for data-skills endpoint',
              'data-skills'
            );
          }
          const result = await client.dataSkills.endpoint({ name, file });
          return asJson ? result : formatSkillEndpoint(result);
        }
        default:
          throw new CliUsageError(
            `Unknown subcommand: data-skills ${subcommand}`,
            'data-skills'
          );
      }
    }

    case 'skillhub': {
      if (!subcommand)
        throw new CliUsageError('Missing subcommand for skillhub', 'skillhub');
      const asJson = boolFlag(flags['json']) ?? false;
      switch (subcommand) {
        case 'list': {
          const result = await client.playbookSkills.list({
            tag: flags['tag'],
            username: flags['username'],
          });
          return asJson ? result : formatPlaybookSkillsList(result);
        }
        case 'tags': {
          const result = await client.playbookSkills.tags();
          return asJson ? result : formatPlaybookSkillsTags(result);
        }
        case 'get': {
          const id = args[2];
          if (!id || id.startsWith('--')) {
            throw new CliUsageError(
              'Missing playbook skill identifier for skillhub get',
              'skillhub'
            );
          }
          const result = await client.playbookSkills.get(id);
          return asJson ? result : formatPlaybookSkillGet(result);
        }
        case 'file': {
          const id = args[2];
          if (!id || id.startsWith('--')) {
            throw new CliUsageError(
              'Missing playbook skill identifier for skillhub file',
              'skillhub'
            );
          }
          const path = args[3];
          if (!path || path.startsWith('--')) {
            throw new CliUsageError(
              'Missing file path for skillhub file',
              'skillhub'
            );
          }
          const result = await client.playbookSkills.file(id, path);
          return asJson ? result : formatPlaybookSkillFile(result);
        }
        default:
          throw new CliUsageError(
            `Unknown subcommand: skillhub ${subcommand}`,
            'skillhub'
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

    case 'notification-history': {
      if (!subcommand)
        throw new CliUsageError(
          'Missing subcommand for notification-history',
          'notification-history'
        );
      const params = {
        username: requireFlag(
          flags,
          'username',
          `notification-history ${subcommand}`
        ),
        name: requireFlag(flags, 'name', `notification-history ${subcommand}`),
        channel: flags['channel'],
        status: flags['status'],
        since_time: num(flags['since']),
        first: num(flags['first']),
        cursor: flags['cursor'],
      };
      switch (subcommand) {
        case 'list-playbook':
          return client.notifications.listPlaybook(params);
        case 'list-feed':
          return client.notifications.listFeed(params);
        default:
          throw new CliUsageError(
            `Unknown subcommand: notification-history ${subcommand}`,
            'notification-history'
          );
      }
    }

    case 'notification-preferences': {
      if (!subcommand)
        throw new CliUsageError(
          'Missing subcommand for notification-preferences',
          'notification-preferences'
        );
      switch (subcommand) {
        case 'list':
          return client.notificationPreferences.list();
        case 'enable-session-completed':
          return client.notificationPreferences.update({
            key: 'session_completed',
            enabled: true,
          });
        case 'disable-session-completed':
          return client.notificationPreferences.update({
            key: 'session_completed',
            enabled: false,
          });
        default:
          throw new CliUsageError(
            `Unknown subcommand: notification-preferences ${subcommand}`,
            'notification-preferences'
          );
      }
    }

    case 'feedback': {
      if (!subcommand)
        throw new CliUsageError('Missing subcommand for feedback', 'feedback');
      switch (subcommand) {
        case 'submit':
          if (flags['dedupe-key'] !== undefined) {
            throw new CliUsageError(
              "--dedupe-key is no longer supported for 'feedback submit'",
              'feedback'
            );
          }
          return client.feedback.submit({
            source: flags['source'],
            category: flags['category'],
            severity: flags['severity'],
            summary: requireFlag(flags, 'summary', 'feedback submit'),
            details: flags['details'],
            evidence: jsonObjectFlag(flags, 'evidence-json', 'feedback submit'),
            context: jsonObjectFlag(flags, 'context-json', 'feedback submit'),
          });
        default:
          throw new CliUsageError(
            `Unknown subcommand: feedback ${subcommand}`,
            'feedback'
          );
      }
    }

    case 'subscriptions': {
      if (!subcommand)
        throw new CliUsageError(
          'Missing subcommand for subscriptions',
          'subscriptions'
        );
      switch (subcommand) {
        case 'subscribe-playbook':
          return client.subscriptions.subscribePlaybook({
            username: requireFlag(
              flags,
              'username',
              'subscriptions subscribe-playbook'
            ),
            name: requireFlag(
              flags,
              'name',
              'subscriptions subscribe-playbook'
            ),
          });
        case 'unsubscribe-playbook':
          return client.subscriptions.unsubscribePlaybook({
            username: requireFlag(
              flags,
              'username',
              'subscriptions unsubscribe-playbook'
            ),
            name: requireFlag(
              flags,
              'name',
              'subscriptions unsubscribe-playbook'
            ),
          });
        case 'subscribe-feed':
          return client.subscriptions.subscribeFeed({
            username: requireFlag(
              flags,
              'username',
              'subscriptions subscribe-feed'
            ),
            name: requireFlag(flags, 'name', 'subscriptions subscribe-feed'),
          });
        case 'unsubscribe-feed':
          return client.subscriptions.unsubscribeFeed({
            username: requireFlag(
              flags,
              'username',
              'subscriptions unsubscribe-feed'
            ),
            name: requireFlag(flags, 'name', 'subscriptions unsubscribe-feed'),
          });
        case 'list':
          return client.subscriptions.list({
            first: num(flags['first']),
            cursor: flags['cursor'],
          });
        case 'follows':
          return client.subscriptions.follows({
            limit: num(flags['limit']),
            cursor: flags['cursor'],
          });
        case 'unsubscribe': {
          const playbookIds = csvList(flags['playbook-ids']) ?? [];
          const feedIds = csvList(flags['feed-ids']) ?? [];
          if (playbookIds.length === 0 && feedIds.length === 0) {
            throw new CliUsageError(
              '--playbook-ids or --feed-ids is required',
              'subscriptions'
            );
          }
          return client.subscriptions.unsubscribeBatch({
            playbookIds,
            feedIds,
          });
        }
        default:
          throw new CliUsageError(
            `Unknown subcommand: subscriptions ${subcommand}`,
            'subscriptions'
          );
      }
    }

    case 'alert': {
      if (!subcommand)
        throw new CliUsageError('Missing subcommand for alert', 'alert');
      switch (subcommand) {
        case 'list': {
          const result = await client.alerts.list({
            first: num(flags['first']),
            cursor: flags['cursor'],
          });
          return boolFlag(flags['json']) ? result : formatAlertList(result);
        }
        case 'follows':
          return client.alerts.follows({
            limit: num(flags['limit']),
            cursor: flags['cursor'],
          });
        case 'enable': {
          const target = requireSingleAlertTarget(flags, 'alert enable');
          return target.kind === 'automation'
            ? client.alerts.enableAutomation(target.target)
            : client.alerts.enablePlaybook(target.target);
        }
        case 'disable': {
          const automationIds =
            csvList(flags['automation-ids']) ??
            csvList(flags['feed-ids']) ??
            [];
          const playbookIds = csvList(flags['playbook-ids']) ?? [];
          if (automationIds.length > 0 || playbookIds.length > 0) {
            return client.alerts.disableBatch({
              playbookIds,
              feedIds: automationIds,
            });
          }
          const target = requireSingleAlertTarget(flags, 'alert disable');
          return target.kind === 'automation'
            ? client.alerts.disableAutomation(target.target)
            : client.alerts.disablePlaybook(target.target);
        }
        case 'history': {
          const target = requireSingleAlertTarget(flags, 'alert history');
          const params = {
            username: target.target.username,
            name: target.target.name,
            channel: flags['channel'],
            status: flags['status'],
            since_time: num(flags['since']),
            first: num(flags['first']),
            cursor: flags['cursor'],
          };
          return target.kind === 'automation'
            ? client.alerts.historyAutomation(params)
            : client.alerts.historyPlaybook(params);
        }
        case 'preferences':
          return client.alerts.preferences();
        case 'enable-session-completed':
          return client.alerts.updatePreference({
            key: 'session_completed',
            enabled: true,
          });
        case 'disable-session-completed':
          return client.alerts.updatePreference({
            key: 'session_completed',
            enabled: false,
          });
        default:
          throw new CliUsageError(
            `Unknown subcommand: alert ${subcommand}`,
            'alert'
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
      const hasOut = flags['out'] !== undefined;
      const wantBase64 = boolFlag(flags['base64']) === true;
      if (hasOut && wantBase64) {
        throw new CliUsageError(
          'screenshot accepts only one of --out (local file) or --base64 (stdout); both were provided.',
          'screenshot'
        );
      }
      if (!hasOut && !wantBase64) {
        throw new CliUsageError(
          'one of --out/--base64 is required for screenshot',
          'screenshot'
        );
      }

      const url = requireFlag(flags, 'url', 'screenshot');
      const selector = flags['selector'];
      const xpath = flags['xpath'];

      if (wantBase64) {
        // base64 mode: no local FS — safe in jagent.
        const full = boolFlag(flags['full']) === true;
        const explicitQuality = flags['compress-quality'];
        const explicitMaxWidth = flags['compress-max-width'];
        // Disable compression when --full, or when the caller explicitly opts
        // out via --no-compress / --compress=false (mirrors the --out path,
        // which honors boolFlag(flags['compress'])). Otherwise compress by
        // default to bound the base64 payload size.
        const noCompress = full || boolFlag(flags['compress']) === false;
        let compress: boolean;
        let compressQuality: number | undefined;
        let compressMaxWidth: number | undefined;
        if (noCompress) {
          compress = false;
          compressQuality = undefined;
          compressMaxWidth = undefined;
        } else {
          compress = true;
          compressQuality =
            explicitQuality !== undefined ? Number(explicitQuality) : 70;
          compressMaxWidth =
            explicitMaxWidth !== undefined ? Number(explicitMaxWidth) : 1280;
        }
        const result = await client.screenshot.capture({
          url,
          selector,
          xpath,
          compress,
          compressQuality,
          compressMaxWidth,
        });
        const buf = Buffer.from(result as ArrayBuffer);
        if (buf.length === 0) {
          throw new CliUsageError(
            'Screenshot service returned empty response (0 bytes). The service may be overloaded — retry in a few seconds.',
            'screenshot'
          );
        }
        return {
          _image: true,
          mimeType: sniffImageMime(buf),
          data: Buffer.from(buf).toString('base64'),
          bytes: buf.length,
        };
      }

      const outFile = requireFlag(flags, 'out', 'screenshot');
      assertLocalFileAvailable('screenshot', 'out', deps);
      const compressQuality = flags['compress-quality'];
      const compressMaxWidth = flags['compress-max-width'];
      const result = await client.screenshot.capture({
        url,
        selector,
        xpath,
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
      writeLocalFileBytes(
        outFile,
        new Uint8Array(buf),
        'screenshot',
        'out',
        deps
      );
      return { written: outFile, bytes: buf.length };
    }

    case 'portfolio': {
      if (!subcommand)
        throw new CliUsageError(
          'Missing subcommand for portfolio',
          'portfolio'
        );
      switch (subcommand) {
        case 'accounts':
          return client.portfolio.accounts();
        case 'summary':
          return client.portfolio.summary(
            requireFlag(flags, 'account-id', 'portfolio summary')
          );
        case 'activities':
          return client.portfolio.activities({
            accountId: requireFlag(flags, 'account-id', 'portfolio activities'),
            limit: num(flags['limit']),
            pageToken: flags['page-token'],
          });
        default:
          throw new CliUsageError(
            `Unknown subcommand: portfolio ${subcommand}`,
            'portfolio'
          );
      }
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
    // `broker` is a raw argv passthrough to trex: once the broker command
    // begins, every remaining token is venue-native and must be forwarded
    // verbatim. Global flags are positional — they precede the command group —
    // so stop stripping here, otherwise a venue flag that happens to collide
    // with a CLI global (--api-key/--base-url/--profile/--arrays-endpoint) is
    // silently dropped with its value (adversarial review).
    if (a === 'broker') {
      result.push(...argv.slice(i));
      break;
    }
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
        const loginFlags = parseFlags(rawArgs.slice(1));
        const mode = selectMode(
          process.env as Record<string, string | undefined>,
          {
            noBrowser: boolFlag(loginFlags['no-browser']) === true,
            browser: boolFlag(loginFlags['browser']) === true,
          },
          process.platform
        );
        const result =
          mode === 'no-browser'
            ? await handleAuthLoginNoBrowser(rawArgs)
            : await handleAuthLogin(rawArgs);
        // Human-readable one-liner. The 13-char prefix mirrors the
        // backend's key_prefix convention (alva_ + first 8 hex chars)
        // so users can correlate the displayed key with their key list
        // without exposing the full secret.
        const keyHint = `${result.apiKey.slice(0, 13)}...`;
        // Explicit exit. Mode A's listener + paste race may leave a
        // dangling readline holding stdin open even after settle; auth
        // login is a terminal command so just unwind hard once we've
        // written the success line.
        process.stdout.write(
          `Logged in as profile "${result.profile}" (api key ${keyHint}).\n`,
          () => process.exit(0)
        );
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
      gaClientId: config.gaClientId,
      gaSessionId: config.gaSessionId,
      utmParams: config.utmParams,
      originSessionId: config.originSessionId,
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
    if (
      result &&
      typeof result === 'object' &&
      (result as Record<string, unknown>)._image === true &&
      typeof (result as Record<string, unknown>).data === 'string'
    ) {
      // Tagged image result (e.g. `screenshot --base64`): emit just the raw
      // base64 to stdout so it can be piped/decoded, rather than the JSON
      // envelope. The shape is validated narrowly (not just key presence) so an
      // ordinary result that happens to carry an `_image` field — e.g. `fs read`
      // of a JSON file like {"_image":false,...} — is not mistaken for one.
      // (In-process callers like the @alva/pi tool consume the envelope directly
      // and never reach main().)
      const imageResult = result as unknown as { data: string };
      process.stdout.write(imageResult.data + '\n');
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
        ...(err.details !== undefined ? { details: err.details } : {}),
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
