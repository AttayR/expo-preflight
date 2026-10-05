import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPreflightConfig } from '../src/config.js';
import { main } from '../src/main.js';
import { formatGithub, GITHUB_MARKER } from '../src/report.js';
import { audit } from '../src/run.js';
import { makeProject } from './helpers.js';

const failing = resolve('test/fixtures/failing');
const clean = resolve('test/fixtures/clean');

function run(args: string[]) {
  const out: string[] = [];
  const code = main(args, (s) => out.push(s));
  return { code, out: out.join('\n') };
}

describe('CLI (in-process)', () => {
  it('fails on the failing fixture with json output', () => {
    const { code, out } = run([failing, '--json']);
    expect(code).toBe(1);
    const report = JSON.parse(out);
    expect(report.counts.error).toBeGreaterThan(0);
    const ids = new Set(report.findings.map((f: { ruleId: string }) => f.ruleId));
    for (const id of [
      'ios-usage-descriptions',
      'android-permissions',
      'runtime-version',
      'eas-config',
      'versioning',
      'secrets-hygiene',
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('passes on the clean fixture', () => {
    const { code, out } = run([clean, '--format', 'json']);
    expect(code).toBe(0);
    expect(JSON.parse(out).findings).toEqual([]);
  });

  it('--fail-on warn fails when only warnings exist', () => {
    const dir = makeProject({
      'package.json': { name: 'x', dependencies: {} },
      'app.json': { expo: { version: '1.0.0' } },
      'eas.json': { cli: { appVersionSource: 'remote' }, build: { production: {} } },
      '.gitignore': '.env\n',
    });
    expect(run([dir, '--json']).code).toBe(0);
    // no submit section -> warning
    expect(run([dir, '--json', '--fail-on', 'warn']).code).toBe(1);
  });

  it('github format emits markdown with marker', () => {
    const { out } = run([failing, '--format', 'github']);
    expect(out.startsWith(GITHUB_MARKER)).toBe(true);
    expect(out).toContain('| Rule |');
  });

  it('pretty output has a summary line', () => {
    const { out } = run([failing, '--no-color']);
    expect(out).toMatch(/FAIL {2}\d+ errors?, \d+ warnings?/);
  });

  it('returns 2 for bad usage', () => {
    expect(run(['/definitely/not/here']).code).toBe(2);
    expect(run([clean, '--format', 'xml']).code).toBe(2);
    expect(run([clean, '--fail-on', 'nope']).code).toBe(2);
  });
});

describe('config', () => {
  it('rule toggles and severity overrides', () => {
    const dir = makeProject({
      '.preflightrc.json': {
        rules: { 'secrets-hygiene': 'off', versioning: 'warn' },
        failOn: 'warn',
      },
    });
    const cfg = loadPreflightConfig(dir);
    expect(cfg.failOn).toBe('warn');
    const report = audit(failing, cfg);
    expect(report.rulesRun).not.toContain('secrets-hygiene');
    expect(
      report.findings.filter((f) => f.ruleId === 'versioning').every((f) => f.severity === 'warn'),
    ).toBe(true);
  });

  it('rejects invalid config and honours --config', () => {
    const dir = makeProject({
      'bad.json': { rules: { x: 'loud' } },
      'ok.json': { rules: { versioning: false } },
    });
    expect(() => loadPreflightConfig(dir, `${dir}/bad.json`)).toThrow(/rules\.x/);
    expect(loadPreflightConfig(dir, `${dir}/ok.json`).rules?.versioning).toBe('off');
    expect(run([clean, '--config', `${dir}/bad.json`]).code).toBe(2);
  });
});

describe('dynamic config', () => {
  it('emits an info note and extracts values best-effort', () => {
    const dir = makeProject({
      'package.json': { name: 'x', dependencies: { 'expo-camera': '*' } },
      'app.config.ts': `export default { version: '1.0.0', ios: { infoPlist: { NSCameraUsageDescription: 'x', NSMicrophoneUsageDescription: 'y' } } };`,
    });
    const report = audit(dir);
    expect(report.counts.info).toBe(1);
    expect(report.findings.some((f) => f.ruleId === 'ios-usage-descriptions')).toBe(false);
  });
});

describe('github formatter', () => {
  it('escapes pipes', () => {
    const md = formatGithub({
      root: '.',
      rulesRun: ['x'],
      counts: { error: 1, warn: 0, info: 0 },
      findings: [{ ruleId: 'x', severity: 'error', message: 'a|b', fix: 'c', docs: 'd' }],
    });
    expect(md).toContain('a\\|b');
  });
});

describe('built binary', () => {
  beforeAll(() => {
    if (!existsSync('dist/cli.js')) execFileSync('npm', ['run', 'build'], { stdio: 'ignore' });
  });
  it('runs via node and sets exit code', () => {
    const r = spawnSync('node', ['dist/cli.js', failing, '--json'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).counts.error).toBeGreaterThan(0);
    const ok = spawnSync('node', ['dist/cli.js', clean], { encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(
      spawnSync('node', ['dist/cli.js', '--version'], { encoding: 'utf8' }).stdout.trim(),
    ).toBe('0.1.1');
  });
});
