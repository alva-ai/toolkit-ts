import { describe, it, expect, vi } from 'vitest';
import { loadConfig, writeConfig } from '../src/cli/config.js';

describe('loadConfig', () => {
  it('--api-key flag wins over env and file', () => {
    const result = loadConfig({
      argv: ['--api-key', 'from-flag'],
      env: { ALVA_API_KEY: 'from-env' },
      readFile: () => JSON.stringify({ apiKey: 'from-file' }),
      homedir: () => '/home/test',
    });
    expect(result.apiKey).toBe('from-flag');
  });

  it('ALVA_API_KEY env wins over file', () => {
    const result = loadConfig({
      argv: [],
      env: { ALVA_API_KEY: 'from-env' },
      readFile: () => JSON.stringify({ apiKey: 'from-file' }),
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
        return JSON.stringify({ apiKey: 'from-xdg' });
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
        return JSON.stringify({ apiKey: 'from-default' });
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
});

describe('writeConfig', () => {
  const makeDeps = () => ({
    env: {} as Record<string, string | undefined>,
    homedir: () => '/home/test',
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  });

  it('writes config file with apiKey', async () => {
    const deps = makeDeps();
    const result = await writeConfig({ apiKey: 'test-key' }, deps);
    expect(result.apiKey).toBe('test-key');
    expect(deps.writeFile).toHaveBeenCalledWith(
      '/home/test/.config/alva/config.json',
      expect.stringContaining('"apiKey": "test-key"'),
      expect.objectContaining({ mode: 0o600 })
    );
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
    expect(written).toEqual({ apiKey: 'k', baseUrl: 'http://localhost' });
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

  it('merges with existing config', async () => {
    const deps = makeDeps();
    deps.readFile.mockResolvedValue(
      JSON.stringify({ apiKey: 'old', baseUrl: 'http://existing' })
    );
    const result = await writeConfig({ apiKey: 'new-key' }, deps);
    expect(result.apiKey).toBe('new-key');
    expect(result.baseUrl).toBe('http://existing');
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
