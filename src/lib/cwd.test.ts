import { describe, it, expect } from 'vitest';
import { normalizeCwd } from './cwd';

// ── Windows platform ──

describe('normalizeCwd — windows', () => {
  const win = 'windows';

  // file:// URLs
  it('converts file://HOST/c/Users/... to C:\\Users\\...', () => {
    expect(normalizeCwd('file://DESKTOP-ABC/c/Users/brayd/Desktop', win)).toBe(
      'C:\\Users\\brayd\\Desktop',
    );
  });

  it('converts file:///c/Users/... (no host) to C:\\Users\\...', () => {
    expect(normalizeCwd('file:///c/Users/brayd', win)).toBe('C:\\Users\\brayd');
  });

  it('converts file:///C:/Users/... (already drive-rooted URL)', () => {
    expect(normalizeCwd('file:///C:/Users/brayd', win)).toBe(
      'C:\\Users\\brayd',
    );
  });

  it('decodes percent-encoded file:// URLs', () => {
    expect(normalizeCwd('file:///c/Users/My%20Folder/test', win)).toBe(
      'C:\\Users\\My Folder\\test',
    );
  });

  // MSYS / Cygwin bare paths
  it('converts /c/Users/... to C:\\Users\\...', () => {
    expect(normalizeCwd('/c/Users/brayd', win)).toBe('C:\\Users\\brayd');
  });

  it('converts lowercase drive letter to uppercase', () => {
    expect(normalizeCwd('/d/Projects', win)).toBe('D:\\Projects');
  });

  // Native Windows passthrough
  it('passes through C:\\Users\\... unchanged', () => {
    expect(normalizeCwd('C:\\Users\\brayd', win)).toBe('C:\\Users\\brayd');
  });

  it('normalizes forward slashes to backslashes', () => {
    expect(normalizeCwd('C:/Users/brayd/Desktop', win)).toBe(
      'C:\\Users\\brayd\\Desktop',
    );
  });

  // /C:/... (slash before drive letter)
  it('strips leading slash before drive letter', () => {
    expect(normalizeCwd('/C:/Users/brayd', win)).toBe('C:\\Users\\brayd');
  });

  // Edge cases
  it('returns null for empty string', () => {
    expect(normalizeCwd('', win)).toBeNull();
  });

  it('returns null for whitespace-only', () => {
    expect(normalizeCwd('   ', win)).toBeNull();
  });

  it('returns null for bare drive letter without backslash', () => {
    // "C:" alone doesn't match /^[A-Za-z]:\\/
    expect(normalizeCwd('C:', win)).toBeNull();
  });

  it('returns null for relative paths (no drive letter)', () => {
    expect(normalizeCwd('Users/brayd', win)).toBeNull();
  });

  it('collapses repeated backslashes', () => {
    expect(normalizeCwd('C:\\\\Users\\\\brayd', win)).toBe('C:\\Users\\brayd');
  });

  it('strips trailing backslash', () => {
    expect(normalizeCwd('C:\\Users\\brayd\\', win)).toBe('C:\\Users\\brayd');
  });

  it('preserves root drive path (C:\\)', () => {
    expect(normalizeCwd('C:\\', win)).toBe('C:\\');
  });

  it('preserves UNC paths (\\\\server\\share)', () => {
    expect(normalizeCwd('\\\\server\\share', win)).toBe('\\\\server\\share');
  });

  it('preserves UNC paths with subdirectories', () => {
    expect(normalizeCwd('\\\\server\\share\\folder\\sub', win)).toBe(
      '\\\\server\\share\\folder\\sub',
    );
  });

  it('strips trailing backslash from UNC subpaths', () => {
    expect(normalizeCwd('\\\\server\\share\\folder\\', win)).toBe(
      '\\\\server\\share\\folder',
    );
  });

  it('converts WSL /mnt/c paths to drive-letter paths', () => {
    expect(normalizeCwd('/mnt/c/Users/brayd', win)).toBe('C:\\Users\\brayd');
  });

  it('converts WSL /mnt/d paths to drive-letter paths', () => {
    expect(normalizeCwd('/mnt/d/Projects', win)).toBe('D:\\Projects');
  });

  it('handles .. components (no resolution, just passthrough)', () => {
    // normalizeCwd doesn't resolve .., it just normalizes slashes
    const result = normalizeCwd('C:\\Users\\brayd\\..\\other', win);
    expect(result).toBe('C:\\Users\\brayd\\..\\other');
  });
});

// ── Unix platform ──

describe('normalizeCwd — unix (linux/macos)', () => {
  const unix = 'linux';

  it('passes through absolute paths', () => {
    expect(normalizeCwd('/home/user/projects', unix)).toBe(
      '/home/user/projects',
    );
  });

  it('parses file:// URLs to absolute path', () => {
    expect(normalizeCwd('file:///home/user/projects', unix)).toBe(
      '/home/user/projects',
    );
  });

  it('decodes percent-encoded file:// URLs', () => {
    expect(normalizeCwd('file:///home/user/my%20folder', unix)).toBe(
      '/home/user/my folder',
    );
  });

  it('returns null for relative paths', () => {
    expect(normalizeCwd('home/user', unix)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeCwd('', unix)).toBeNull();
  });

  it('collapses repeated slashes', () => {
    expect(normalizeCwd('//home///user', unix)).toBe('/home/user');
  });

  it('strips trailing slash', () => {
    expect(normalizeCwd('/home/user/', unix)).toBe('/home/user');
  });

  it('preserves root /', () => {
    expect(normalizeCwd('/', unix)).toBe('/');
  });

  it('handles malformed file:// URL gracefully', () => {
    // Missing third slash — URL constructor may fail, fallback kicks in
    const result = normalizeCwd('file://home/user', unix);
    // The fallback strips file://[^/]* → result depends on path after host
    // 'file://home/user' → host=home, pathname=/user → '/user'
    expect(result).toBe('/user');
  });
});
