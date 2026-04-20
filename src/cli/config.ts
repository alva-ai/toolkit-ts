import { DEFAULT_ARRAYS_BASE_URL } from '../client.js';

export interface CliConfig {
  apiKey?: string;
  baseUrl?: string;
  arraysBaseUrl: string;
  profile?: string;
}

interface ProfileData {
  apiKey?: string;
  baseUrl?: string;
}

interface ConfigFile {
  profiles?: Record<string, ProfileData>;
  // Legacy flat fields (pre-profile format)
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

function configPath(deps: {
  env: Record<string, string | undefined>;
  homedir: () => string;
}): string {
  const configDir = deps.env.XDG_CONFIG_HOME || `${deps.homedir()}/.config`;
  return `${configDir}/alva/config.json`;
}

function configDir(deps: {
  env: Record<string, string | undefined>;
  homedir: () => string;
}): string {
  const configRoot = deps.env.XDG_CONFIG_HOME || `${deps.homedir()}/.config`;
  return `${configRoot}/alva`;
}

/**
 * Read and normalize config file. Handles both legacy flat format
 * and new profile-based format.
 */
function readConfigFile(raw: string): ConfigFile {
  const parsed = JSON.parse(raw);
  return parsed as ConfigFile;
}

/**
 * Extract profile data from a config file. Handles migration from
 * legacy flat format (apiKey at root) to profile-based format.
 */
function getProfile(config: ConfigFile, profileName: string): ProfileData {
  // New format: profiles map
  if (config.profiles && config.profiles[profileName]) {
    return config.profiles[profileName];
  }
  // Legacy flat format: treat root-level apiKey/baseUrl as "default" profile
  if (profileName === 'default' && config.apiKey) {
    return { apiKey: config.apiKey, baseUrl: config.baseUrl };
  }
  return {};
}

export async function writeConfig(
  config: { apiKey: string; baseUrl?: string },
  deps: WriteConfigDeps,
  profileName: string = 'default'
): Promise<CliConfig> {
  const path = configPath(deps);
  const dir = configDir(deps);

  // Read existing config
  let existing: ConfigFile = {};
  try {
    const raw = await deps.readFile(path);
    existing = readConfigFile(raw);
  } catch {
    // File doesn't exist or can't be parsed — start fresh
  }

  // Migrate legacy flat format to profiles
  if (!existing.profiles) {
    existing.profiles = {};
    if (existing.apiKey) {
      existing.profiles['default'] = {
        apiKey: existing.apiKey,
        baseUrl: existing.baseUrl,
      };
    }
  }

  // Update the target profile
  const profileData: ProfileData = {
    ...(existing.profiles[profileName] || {}),
    apiKey: config.apiKey,
  };
  if (config.baseUrl) {
    profileData.baseUrl = config.baseUrl;
  } else if (!existing.profiles[profileName]?.baseUrl) {
    delete profileData.baseUrl;
  }
  existing.profiles[profileName] = profileData;

  // Write clean format (profiles only, no legacy root fields)
  const output: ConfigFile = { profiles: existing.profiles };
  await deps.mkdir(dir, { recursive: true });
  await deps.writeFile(path, JSON.stringify(output, null, 2) + '\n', {
    mode: 0o600,
  });

  return {
    apiKey: profileData.apiKey,
    baseUrl: profileData.baseUrl,
    arraysBaseUrl: DEFAULT_ARRAYS_BASE_URL,
    profile: profileName,
  };
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

  // Resolve profile name: flag > env > default
  const profileName =
    parseFlag(argv, '--profile') || env.ALVA_PROFILE || 'default';

  // Resolve base URL: flag > env > file > default
  const baseUrlFlag = parseFlag(argv, '--base-url');
  const baseUrlEnv = env.ALVA_ENDPOINT;

  // Resolve arrays base URL: flag > env > default (no file layer)
  const arraysBaseUrlFlag = parseFlag(argv, '--arrays-endpoint');
  const arraysBaseUrlEnv = env.ARRAYS_ENDPOINT;

  // Resolve API key: flag > env > file
  const apiKeyFlag = parseFlag(argv, '--api-key');
  const apiKeyEnv = env.ALVA_API_KEY;

  // Read config file
  let fileProfile: ProfileData = {};
  const path = configPath({ env, homedir });
  try {
    const raw = readFile(path);
    let config: ConfigFile;
    try {
      config = readConfigFile(raw);
    } catch {
      throw new Error(`Failed to parse ${path}: invalid JSON`);
    }
    fileProfile = getProfile(config, profileName);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Failed to parse')) {
      throw e;
    }
    // File not found — that's fine
  }

  return {
    apiKey: apiKeyFlag ?? apiKeyEnv ?? fileProfile.apiKey,
    baseUrl: baseUrlFlag ?? baseUrlEnv ?? fileProfile.baseUrl,
    arraysBaseUrl:
      arraysBaseUrlFlag ?? arraysBaseUrlEnv ?? DEFAULT_ARRAYS_BASE_URL,
    profile: profileName,
  };
}
