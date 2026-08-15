export const AGENT_HELP_TEXT = `Usage: alva <command> [options]

Slim Alva Agent CLI. Authentication and endpoints are owned by Jagent.

Commands:
  account       Identity, credits, secrets, notifications, service accounts
  fs            Read and manage ALFS paths
  run           Execute Jagent JavaScript
  data-skills   Discover structured Arrays data endpoints
  skillhub      Discover curated methodology blueprints
  markets       Read market narrative and earnings context
  automation    Create and operate scheduled automations
  playbooks     Discover, build, release, and manage Playbooks
  alert         Manage personal automation alert bindings
  portfolio     Read connected accounts, assets, activity, and history
  trading       Inspect controls and use Signal or Broker execution
  feedback      Submit user-confirmed platform feedback

Run 'alva <command> --help' for a command tree.`;

export const AGENT_COMMAND_HELP: Readonly<Record<string, string>> = {
  account: `Usage: alva account <subcommand>

Subcommands:
  whoami
  credits wallet|items
  secrets create|list|get|update|delete
  notifications preferences|set-preference
  service-accounts create|list|delete|grant|revoke`,

  fs: `Usage: alva fs <subcommand>

Subcommands:
  read  write  stat  readdir  mkdir  remove
  rename  copy  symlink  readlink  chmod  grant  revoke`,

  run: `Usage: alva run (--code <js> | --entry-path <alfs-path>) [options]

Execute JavaScript in the Jagent runtime. Local-file flags are unavailable in
the embedded Agent; use ALFS paths or inline code.`,

  'data-skills': `Usage: alva data-skills <subcommand>

Subcommands:
  list
  summary <skill-name>
  endpoint <skill-name> <endpoint-file>`,

  skillhub: `Usage: alva skillhub <subcommand>

Subcommands:
  list  tags  get  file`,

  markets: `Usage: alva markets <subcommand>

Subcommands:
  narrative
  earnings`,

  automation: `Usage: alva automation <subcommand>

Subcommands:
  create          Create a producer and register its automation
  list            List product automations
  inspect         Inspect one automation
  update          Update producer and/or product metadata
  delivery        Read or update Alva channel and verified-email destinations
  delete          Delete an automation and its producer
  pause           Pause product delivery and its producer
  resume          Resume product delivery and its producer
  trigger         Trigger the effective producer once
  set-visibility  Set automation visibility
  runs            Run history, status, and logs`,

  'automation delivery': `Usage: alva automation delivery <subcommand> --id <automation-id>

Subcommands:
  get
  update`,

  'automation runs': `Usage: alva automation runs <subcommand> --id <automation-id>

Subcommands:
  list
  status
  logs`,

  playbooks: `Usage: alva playbooks <subcommand>

Subcommands:
  trending  list  mine  get  set-visibility
  draft  release  lint  screenshot  remix
  comments  follows  functions`,

  'playbooks comments': `Usage: alva playbooks comments <subcommand>

Subcommands:
  create  pin  unpin`,

  'playbooks follows': `Usage: alva playbooks follows <subcommand>

Subcommands:
  list  follow  unfollow`,

  'playbooks functions': `Usage: alva playbooks functions <subcommand>

Subcommands:
  register  list  delete  invoke  allowance`,

  'playbooks functions allowance': `Usage: alva playbooks functions allowance <subcommand>

Subcommands:
  get  list  create  revoke`,

  alert: `Usage: alva alert <subcommand>

Subcommands:
  list  enable  disable  history`,

  portfolio: `Usage: alva portfolio <subcommand>

Subcommands:
  accounts        List TREX and SnapTrade connected accounts
  summary         Read one account's holdings and balances
  activities      Read normalized account activity
  orders          Read detailed TREX order history
  equity-history  Read TREX account equity history`,

  trading: `Usage: alva trading <subcommand>

Subcommands:
  accounts    List execution-capable TREX accounts
  risk-rules  Read the admission limits enforced by Broker and Signal
  signals     Legacy Signal subscriptions and execution
  broker      Venue-native reads and order execution`,

  'trading signals': `Usage: alva trading signals <subcommand>

Legacy Signal/copy-trading surface. It is separate from Broker.

Subcommands:
  subscriptions list|subscribe|unsubscribe
  execute       Interpret one Signal; dry-run unless --live is explicit`,

  'trading signals subscriptions': `Usage: alva trading signals subscriptions <subcommand>

Subcommands:
  list  subscribe  unsubscribe

Subscriptions never execute the latest stored Signal implicitly.`,

  'trading broker': `Usage: alva trading broker <broker-command> [venue flags]

Subcommands:
  describe  balance  positions  quote  ohlcv  funding-rate  raw
  order place|cancel|get|list

Run 'alva trading broker describe' for the live venue contract.`,

  feedback: `Usage: alva feedback submit [options]`,
};

export function agentHelpFor(args: readonly string[]): string | undefined {
  const helpIndex = args.findIndex(
    (argument) => argument === '--help' || argument === '-h'
  );
  const path = (helpIndex === -1 ? args : args.slice(0, helpIndex)).filter(
    (argument) => !argument.startsWith('-')
  );
  for (let length = path.length; length > 0; length--) {
    const help = AGENT_COMMAND_HELP[path.slice(0, length).join(' ')];
    if (help !== undefined) return help;
  }
  return undefined;
}
