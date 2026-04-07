export interface CliConfig {
  apiKey?: string;
  baseUrl?: string;
}

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
}

export async function writeConfig(
  config: { apiKey: string; baseUrl?: string },
  deps: WriteConfigDeps
): Promise<CliConfig> {
  const configDir = deps.env.XDG_CONFIG_HOME || `${deps.homedir()}/.config`;
  const dirPath = `${configDir}/alva`;
  const configPath = `${dirPath}/config.json`;

  // Read existing config to merge
  let existing: Record<string, unknown> = {};
  try {
    const raw = await deps.readFile(configPath);
    existing = JSON.parse(raw);
  } catch {
    // File doesn't exist or can't be parsed — start fresh
  }

  const merged = { ...existing, ...config };
  // Remove undefined values
  if (config.baseUrl === undefined && !existing.baseUrl) {
    delete merged.baseUrl;
  }

  await deps.mkdir(dirPath, { recursive: true });
  await deps.writeFile(configPath, JSON.stringify(merged, null, 2) + '\n', {
    mode: 0o600,
  });

  return merged as CliConfig;
}

interface ConfigDeps {
  argv: string[];
  env: Record<string, string | undefined>;
  readFile: (path: string) => string;
  homedir: () => string;
}

function parseFlag(argv: string[], flag: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag && i + 1 < argv.length) {
      return argv[i + 1];
    }
    if (argv[i].startsWith(`${flag}=`)) {
      return argv[i].slice(flag.length + 1);
    }
  }
  return undefined;
}

export function loadConfig(deps: ConfigDeps): CliConfig {
  const { argv, env, readFile, homedir } = deps;

  // Resolve base URL: flag > env > file > default
  const baseUrlFlag = parseFlag(argv, '--base-url');
  const baseUrlEnv = env.ALVA_ENDPOINT;

  // Resolve API key: flag > env > file
  const apiKeyFlag = parseFlag(argv, '--api-key');
  const apiKeyEnv = env.ALVA_API_KEY;

  // Read config file
  let fileConfig: { apiKey?: string; baseUrl?: string } = {};
  const configDir = env.XDG_CONFIG_HOME || `${homedir()}/.config`;
  const configPath = `${configDir}/alva/config.json`;
  try {
    const raw = readFile(configPath);
    try {
      fileConfig = JSON.parse(raw);
    } catch {
      throw new Error(`Failed to parse ${configPath}: invalid JSON`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Failed to parse')) {
      throw e;
    }
    // File not found — that's fine
  }

  return {
    apiKey: apiKeyFlag ?? apiKeyEnv ?? fileConfig.apiKey,
    baseUrl: baseUrlFlag ?? baseUrlEnv ?? fileConfig.baseUrl,
  };
}
