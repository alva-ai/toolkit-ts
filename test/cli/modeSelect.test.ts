import { describe, it, expect } from 'vitest';
import { selectMode } from '../../src/cli/modeSelect.js';

describe('selectMode', () => {
  it('returns no-browser when --no-browser flag is set (overrides everything)', () => {
    expect(selectMode({ DISPLAY: ':0' }, { noBrowser: true }, 'darwin')).toBe(
      'no-browser'
    );
  });

  it('returns browser when --browser flag is set (overrides env heuristics)', () => {
    expect(
      selectMode(
        { SSH_CONNECTION: '1.2.3.4 22 5.6.7.8 22' },
        { browser: true },
        'linux'
      )
    ).toBe('browser');
  });

  it('returns no-browser on linux without DISPLAY or WAYLAND_DISPLAY', () => {
    expect(selectMode({}, {}, 'linux')).toBe('no-browser');
  });

  it('returns no-browser when SSH_CONNECTION set and no DISPLAY (linux)', () => {
    expect(
      selectMode({ SSH_CONNECTION: '1.2.3.4 22 5.6.7.8 22' }, {}, 'linux')
    ).toBe('no-browser');
  });

  it('returns no-browser when DEVCONTAINER env is set', () => {
    expect(selectMode({ DEVCONTAINER: 'true' }, {}, 'darwin')).toBe(
      'no-browser'
    );
  });

  it('returns no-browser when CONTAINER env is set', () => {
    expect(selectMode({ CONTAINER: 'docker' }, {}, 'darwin')).toBe(
      'no-browser'
    );
  });

  it('returns browser on linux with DISPLAY set', () => {
    expect(selectMode({ DISPLAY: ':0' }, {}, 'linux')).toBe('browser');
  });

  it('returns browser on darwin with no special env', () => {
    expect(selectMode({}, {}, 'darwin')).toBe('browser');
  });

  it('returns browser on linux with WAYLAND_DISPLAY set (no DISPLAY)', () => {
    expect(selectMode({ WAYLAND_DISPLAY: 'wayland-0' }, {}, 'linux')).toBe(
      'browser'
    );
  });
});
