import { describe, it, expect, vi } from 'vitest';
import { loadConfig, writeConfig } from '../src/cli/config.js';

describe('loadConfig', () => {
  it('--api-key flag wins over env and file', () => {
    const result = loadConfig({
      argv: ['--api-key', 'from-flag'],
      env: { ALVA_API_KEY: 'from-env' },
      readFile: () =>
        JSON.stringify({
          profiles: { default: { apiKey: 'from-file' } },
        }),
      homedir: () => '/home/test',
    });
    expect(result.apiKey).toBe('from-flag');
  });

  it('ALVA_API_KEY env wins over file', () => {
    const result = loadConfig({
      argv: [],
      env: { ALVA_API_KEY: 'from-env' },
      readFile: () =>
        JSON.stringify({
          profiles: { default: { apiKey: 'from-file' } },
        }),
      homedir: () => '/home/test',
    });
    expect(result.apiKey).toBe('from-env');
  });

  it('respects XDG_CONFIG_HOME', () => {
    let readPath = '';
    const result = loadConfig({
      argv: [],
      env: { XDG_CONFIG_HOME: '/custom/config' },
      readFile: (path: string) => {
        readPath = path;
        return JSON.stringify({
          profiles: { default: { apiKey: 'from-xdg' } },
        });
      },
      homedir: () => '/home/test',
    });
    expect(readPath).toBe('/custom/config/alva/config.json');
    expect(result.apiKey).toBe('from-xdg');
  });

  it('falls back to ~/.config/alva when XDG_CONFIG_HOME not set', () => {
    let readPath = '';
    const result = loadConfig({
      argv: [],
      env: {},
      readFile: (path: string) => {
        readPath = path;
        return JSON.stringify({
          profiles: { default: { apiKey: 'from-default' } },
        });
      },
      homedir: () => '/home/test',
    });
    expect(readPath).toBe('/home/test/.config/alva/config.json');
    expect(result.apiKey).toBe('from-default');
  });

  it('returns undefined apiKey when no config found', () => {
    const result = loadConfig({
      argv: [],
      env: {},
      readFile: () => {
        throw new Error('ENOENT');
      },
      homedir: () => '/home/test',
    });
    expect(result.apiKey).toBeUndefined();
  });

  it('throws on malformed JSON', () => {
    expect(() =>
      loadConfig({
        argv: [],
        env: {},
        readFile: () => '{bad json',
        homedir: () => '/home/test',
      })
    ).toThrow(/Failed to parse/);
  });

  it('--base-url flag overrides default', () => {
    const result = loadConfig({
      argv: ['--base-url', 'http://localhost:8080'],
      env: {},
      readFile: () => {
        throw new Error('ENOENT');
      },
      homedir: () => '/home/test',
    });
    expect(result.baseUrl).toBe('http://localhost:8080');
  });

  it('ALVA_ENDPOINT env overrides default', () => {
    const result = loadConfig({
      argv: [],
      env: { ALVA_ENDPOINT: 'http://localhost:9090' },
      readFile: () => {
        throw new Error('ENOENT');
      },
      homedir: () => '/home/test',
    });
    expect(result.baseUrl).toBe('http://localhost:9090');
  });

  it('reads legacy flat config format as default profile', () => {
    const result = loadConfig({
      argv: [],
      env: {},
      readFile: () => JSON.stringify({ apiKey: 'legacy-key' }),
      homedir: () => '/home/test',
    });
    expect(result.apiKey).toBe('legacy-key');
    expect(result.profile).toBe('default');
  });

  it('reads legacy flat config with baseUrl', () => {
    const result = loadConfig({
      argv: [],
      env: {},
      readFile: () =>
        JSON.stringify({
          apiKey: 'legacy-key',
          baseUrl: 'http://legacy',
        }),
      homedir: () => '/home/test',
    });
    expect(result.apiKey).toBe('legacy-key');
    expect(result.baseUrl).toBe('http://legacy');
  });

  it('--profile flag selects named profile', () => {
    const result = loadConfig({
      argv: ['--profile', 'staging'],
      env: {},
      readFile: () =>
        JSON.stringify({
          profiles: {
            default: { apiKey: 'default-key' },
            staging: {
              apiKey: 'staging-key',
              baseUrl: 'http://staging',
            },
          },
        }),
      homedir: () => '/home/test',
    });
    expect(result.apiKey).toBe('staging-key');
    expect(result.baseUrl).toBe('http://staging');
    expect(result.profile).toBe('staging');
  });

  it('ALVA_PROFILE env selects named profile', () => {
    const result = loadConfig({
      argv: [],
      env: { ALVA_PROFILE: 'staging' },
      readFile: () =>
        JSON.stringify({
          profiles: {
            default: { apiKey: 'default-key' },
            staging: { apiKey: 'staging-key' },
          },
        }),
      homedir: () => '/home/test',
    });
    expect(result.apiKey).toBe('staging-key');
    expect(result.profile).toBe('staging');
  });

  it('--profile flag overrides ALVA_PROFILE env', () => {
    const result = loadConfig({
      argv: ['--profile', 'dev'],
      env: { ALVA_PROFILE: 'staging' },
      readFile: () =>
        JSON.stringify({
          profiles: {
            staging: { apiKey: 'staging-key' },
            dev: { apiKey: 'dev-key' },
          },
        }),
      homedir: () => '/home/test',
    });
    expect(result.apiKey).toBe('dev-key');
    expect(result.profile).toBe('dev');
  });

  it('returns undefined for non-existent profile', () => {
    const result = loadConfig({
      argv: ['--profile', 'nonexistent'],
      env: {},
      readFile: () =>
        JSON.stringify({
          profiles: { default: { apiKey: 'default-key' } },
        }),
      homedir: () => '/home/test',
    });
    expect(result.apiKey).toBeUndefined();
    expect(result.profile).toBe('nonexistent');
  });

  it('defaults profile to "default"', () => {
    const result = loadConfig({
      argv: [],
      env: {},
      readFile: () => {
        throw new Error('ENOENT');
      },
      homedir: () => '/home/test',
    });
    expect(result.profile).toBe('default');
  });
});

describe('writeConfig', () => {
  const makeDeps = () => ({
    env: {} as Record<string, string | undefined>,
    homedir: () => '/home/test',
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  });

  it('writes config file with apiKey under default profile', async () => {
    const deps = makeDeps();
    const result = await writeConfig({ apiKey: 'test-key' }, deps);
    expect(result.apiKey).toBe('test-key');
    expect(result.profile).toBe('default');
    const written = JSON.parse(deps.writeFile.mock.calls[0][1] as string);
    expect(written.profiles.default.apiKey).toBe('test-key');
  });

  it('writes config file with apiKey and baseUrl', async () => {
    const deps = makeDeps();
    const result = await writeConfig(
      { apiKey: 'k', baseUrl: 'http://localhost' },
      deps
    );
    expect(result.apiKey).toBe('k');
    expect(result.baseUrl).toBe('http://localhost');
    const written = JSON.parse(deps.writeFile.mock.calls[0][1] as string);
    expect(written.profiles.default).toEqual({
      apiKey: 'k',
      baseUrl: 'http://localhost',
    });
  });

  it('writes to named profile', async () => {
    const deps = makeDeps();
    const result = await writeConfig(
      { apiKey: 'stg-key', baseUrl: 'http://staging' },
      deps,
      'staging'
    );
    expect(result.apiKey).toBe('stg-key');
    expect(result.profile).toBe('staging');
    const written = JSON.parse(deps.writeFile.mock.calls[0][1] as string);
    expect(written.profiles.staging).toEqual({
      apiKey: 'stg-key',
      baseUrl: 'http://staging',
    });
  });

  it('creates parent directories', async () => {
    const deps = makeDeps();
    await writeConfig({ apiKey: 'k' }, deps);
    expect(deps.mkdir).toHaveBeenCalledWith('/home/test/.config/alva', {
      recursive: true,
    });
  });

  it('sets file permissions to 0o600', async () => {
    const deps = makeDeps();
    await writeConfig({ apiKey: 'k' }, deps);
    expect(deps.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ mode: 0o600 })
    );
  });

  it('merges with existing profiles', async () => {
    const deps = makeDeps();
    deps.readFile.mockResolvedValue(
      JSON.stringify({
        profiles: {
          default: { apiKey: 'old', baseUrl: 'http://existing' },
        },
      })
    );
    const result = await writeConfig({ apiKey: 'new-key' }, deps, 'staging');
    expect(result.apiKey).toBe('new-key');
    // Verify existing default profile is preserved
    const written = JSON.parse(deps.writeFile.mock.calls[0][1] as string);
    expect(written.profiles.default.apiKey).toBe('old');
    expect(written.profiles.staging.apiKey).toBe('new-key');
  });

  it('migrates legacy flat format to profiles on write', async () => {
    const deps = makeDeps();
    deps.readFile.mockResolvedValue(
      JSON.stringify({ apiKey: 'legacy-key', baseUrl: 'http://legacy' })
    );
    await writeConfig({ apiKey: 'new-key' }, deps, 'staging');
    const written = JSON.parse(deps.writeFile.mock.calls[0][1] as string);
    // Legacy config migrated to default profile
    expect(written.profiles.default).toEqual({
      apiKey: 'legacy-key',
      baseUrl: 'http://legacy',
    });
    // New profile added
    expect(written.profiles.staging.apiKey).toBe('new-key');
    // No legacy root fields
    expect(written.apiKey).toBeUndefined();
  });

  it('propagates mkdir failure', async () => {
    const deps = makeDeps();
    deps.mkdir.mockRejectedValue(new Error('EACCES'));
    await expect(writeConfig({ apiKey: 'k' }, deps)).rejects.toThrow('EACCES');
  });

  it('propagates writeFile failure', async () => {
    const deps = makeDeps();
    deps.writeFile.mockRejectedValue(new Error('ENOSPC'));
    await expect(writeConfig({ apiKey: 'k' }, deps)).rejects.toThrow('ENOSPC');
  });

  it('respects XDG_CONFIG_HOME', async () => {
    const deps = makeDeps();
    deps.env = { XDG_CONFIG_HOME: '/custom/xdg' };
    await writeConfig({ apiKey: 'k' }, deps);
    expect(deps.mkdir).toHaveBeenCalledWith('/custom/xdg/alva', {
      recursive: true,
    });
    expect(deps.writeFile).toHaveBeenCalledWith(
      '/custom/xdg/alva/config.json',
      expect.any(String),
      expect.any(Object)
    );
  });
});
