import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadProject } from '../src/project.js';
import { androidPermissions } from '../src/rules/android-permissions.js';
import { easConfig, requiredEnvVars } from '../src/rules/eas-config.js';
import { iosUsageDescriptions } from '../src/rules/ios-usage-descriptions.js';
import { secretsHygiene } from '../src/rules/secrets-hygiene.js';
import { versioning } from '../src/rules/versioning.js';
import type { Rule } from '../src/types.js';
import { makeProject, pkg, runRule } from './helpers.js';

const app = (expo: object) => ({ 'app.json': { expo } });

/** Run a rule on a subdirectory of a project (monorepo-style). */
function runIn(rule: Rule, sub: string, files: Record<string, unknown>, git = true) {
  const dir = makeProject(files, { git });
  return rule
    .check(loadProject(join(dir, sub)))
    .map((f) => ({ ...f, severity: f.severity ?? rule.defaultSeverity }));
}

describe('fix 1: monorepo ancestors', () => {
  const noEnvFiles = (f: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'apps/mobile/.env'));
  const files = {
    '.gitignore': 'node_modules\n.env\n',
    '.env.example': 'ROOT_VAR=\n',
    'apps/mobile/package.json': pkg([]),
    'apps/mobile/app.config.js': 'module.exports = { extra: { a: process.env.ROOT_VAR } }',
    'apps/mobile/eas.json': { build: { production: {} } },
    'apps/mobile/.env': 'A=1',
  };
  it('merges ancestor .gitignore inside a git repo', () => {
    const dir = makeProject(files, { git: true });
    const ctx = loadProject(join(dir, 'apps/mobile'));
    expect(ctx.gitignore).toContain('.env');
    expect(ctx.envExampleVars.has('ROOT_VAR')).toBe(true);
    expect(ctx.trackedFiles).toContain('.env');
  });
  it('does not report missing .gitignore when only an ancestor has one', () => {
    const f = runIn(secretsHygiene, 'apps/mobile', noEnvFiles(files));
    expect(f.some((x) => x.message.includes('No .gitignore'))).toBe(false);
  });
  it('ancestor .env.example defines env vars for eas-config', () => {
    const f = runIn(easConfig, 'apps/mobile', files).filter((x) =>
      x.message.includes('references'),
    );
    expect(f).toEqual([]);
  });
  it('still warns when no .gitignore exists anywhere', () => {
    const f = runIn(secretsHygiene, 'apps/mobile', { 'apps/mobile/package.json': pkg([]) });
    expect(f.some((x) => x.message.includes('No .gitignore'))).toBe(true);
  });
});

describe('fix 2: EAS environment and fallbacks', () => {
  it('skips env check when a profile sets `environment`', () => {
    const f = runRule(easConfig, {
      'package.json': pkg([]),
      'app.config.js': 'module.exports = { name: process.env.APP_NAME }',
      'eas.json': { build: { production: { environment: 'production' } } },
    });
    expect(f.filter((x) => x.message.includes('references'))).toEqual([]);
  });
  it('ignores fallbacks and literal comparisons', () => {
    const t =
      "a: process.env.A ?? 'x', b: process.env.B || 'y', c: process.env.C === 'prod', d: 'dev' !== process.env.D, e: process.env.E";
    expect(requiredEnvVars(t)).toEqual(['E']);
  });
  it('a var with one fallback use and one bare use is still reported', () => {
    expect(requiredEnvVars("process.env.A ?? 'x'; process.env.A")).toEqual(['A']);
  });
  it('true positive stays, as info', () => {
    const f = runRule(easConfig, {
      'package.json': pkg([]),
      'app.config.js': 'module.exports = { name: process.env.APP_NAME }',
      'eas.json': { build: { production: {} } },
    }).filter((x) => x.message.includes('APP_NAME'));
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe('info');
  });
});

describe('fix 3: debug keystore, example env files, credentials.json', () => {
  it('exempts debug.keystore and .env.*.example', () => {
    const f = runRule(
      secretsHygiene,
      {
        'android/app/debug.keystore': 'bin',
        '.env.dev.example': 'A=1',
        '.env.prod.sample': 'A=1',
        '.env.staging.template': 'A=1',
        '.gitignore': '.env\n',
      },
      { git: true },
    );
    expect(f).toEqual([]);
  });
  it('still flags a release keystore and a real .env.production', () => {
    const f = runRule(
      secretsHygiene,
      {
        'android/app/release.keystore': 'bin',
        '.env.production': 'KEY=abc123realvalue',
        '.gitignore': '.env\n',
      },
      { git: true },
    );
    expect(
      f
        .filter((x) => x.severity === 'error')
        .map((x) => x.file)
        .sort(),
    ).toEqual(['.env.production', 'android/app/release.keystore']);
  });
  it('credentials.json is info without key/password fields, error with them', () => {
    const benign = runRule(
      secretsHygiene,
      { 'credentials.json': { name: 'x', note: 'hi' }, '.gitignore': '.env\n' },
      { git: true },
    );
    expect(benign.find((x) => x.file === 'credentials.json')?.severity).toBe('info');
    const real = runRule(
      secretsHygiene,
      {
        'credentials.json': { android: { keystore: { keystorePassword: 'hunter2' } } },
        '.gitignore': '.env\n',
      },
      { git: true },
    );
    expect(real.find((x) => x.file === 'credentials.json')?.severity).toBe('error');
    expect(JSON.stringify(real)).not.toContain('hunter2');
  });
});

describe('fix 4: .env*.local counts as ignoring env files', () => {
  it('does not warn for tracked-less projects with Expo default ignore', () => {
    const f = runRule(secretsHygiene, {
      'package.json': pkg([]),
      '.gitignore': 'node_modules\n.env*.local\n',
    });
    expect(f).toEqual([]);
  });
  it('a disk .env.local is covered by .env*.local', () => {
    const f = runRule(secretsHygiene, { '.env.local': 'A=1', '.gitignore': '.env*.local\n' });
    expect(f).toEqual([]);
  });
  it('a genuinely tracked .env with real-looking values still errors and warns', () => {
    const f = runRule(
      secretsHygiene,
      { '.env': 'API_KEY=sk_live_51Habcdef', '.gitignore': '.env*.local\n' },
      { git: true },
    );
    expect(f.find((x) => x.file === '.env')?.severity).toBe('error');
    expect(f.some((x) => x.file === '.gitignore')).toBe(true);
    expect(JSON.stringify(f)).not.toContain('sk_live');
  });
});

describe('fix 5: android permission covers vs requires', () => {
  it('WRITE_CALENDAR is covered by expo-calendar; storage by expo-media-library', () => {
    const f = runRule(androidPermissions, {
      'package.json': pkg(['expo-calendar', 'expo-media-library']),
      ...app({
        android: {
          permissions: [
            'READ_CALENDAR',
            'WRITE_CALENDAR',
            'READ_EXTERNAL_STORAGE',
            'WRITE_EXTERNAL_STORAGE',
          ],
        },
      }),
    });
    expect(f).toEqual([]);
  });
  it('suppresses "missing" when the config plugin is registered', () => {
    const f = runRule(androidPermissions, {
      'package.json': pkg(['expo-image-picker']),
      ...app({
        plugins: [['expo-image-picker', { photosPermission: 'x' }]],
        android: { permissions: [] },
      }),
    });
    expect(f).toEqual([]);
  });
  it('true positives stay: missing without plugin, unknown unused permission', () => {
    const f = runRule(androidPermissions, {
      'package.json': pkg(['expo-image-picker']),
      ...app({ android: { permissions: ['READ_CONTACTS'] } }),
    });
    const msgs = f.map((x) => x.message).join('\n');
    expect(msgs).toContain('does not include CAMERA');
    expect(msgs).toContain('READ_CONTACTS but no installed package');
  });
});

describe('fix 6: example folders and package.json version fallback', () => {
  it('downgrades eas.json not found to info in example/demo folders', () => {
    const f = runIn(easConfig, 'examples/with-s3', {
      'examples/with-s3/package.json': pkg([]),
      'examples/with-s3/app.json': { expo: { name: 'x' } },
    });
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe('info');
  });
  it('eas.json not found is a warning in a normal app', () => {
    const f = runIn(easConfig, 'apps/mobile', { 'apps/mobile/package.json': pkg([]) });
    expect(f[0]?.severity).toBe('warn');
  });
  it('expo.version: package.json version suppresses; example -> info; app -> error', () => {
    const base = { name: 'x' };
    expect(
      runRule(versioning, {
        'package.json': { ...pkg([]), version: '1.2.3' },
        ...app(base),
      }).filter((x) => x.message.includes('expo.version')),
    ).toEqual([]);
    const ex = runIn(versioning, 'demos/a', {
      'demos/a/package.json': pkg([]),
      'demos/a/app.json': { expo: base },
    }).filter((x) => x.message.includes('expo.version'));
    expect(ex[0]?.severity).toBe('info');
    const real = runRule(versioning, { 'package.json': pkg([]), ...app(base) }).filter((x) =>
      x.message.includes('expo.version'),
    );
    expect(real[0]?.severity).toBe('error');
  });
});

describe('fix 7: iOS usage descriptions', () => {
  it('accepts microphonePermission from another audio-family plugin', () => {
    const f = runRule(iosUsageDescriptions, {
      'package.json': pkg(['expo-audio', 'expo-camera']),
      ...app({
        ios: { infoPlist: { NSCameraUsageDescription: 'c' } },
        plugins: [['expo-camera', { microphonePermission: 'mic' }]],
      }),
    });
    expect(f).toEqual([]);
  });
  it('save-only media library needs NSPhotoLibraryAddUsageDescription', () => {
    const files = {
      'package.json': pkg(['expo-media-library']),
      'src/a.ts': "import * as ML from 'expo-media-library';\nawait ML.saveToLibraryAsync(uri);\n",
    };
    const ok = runRule(iosUsageDescriptions, {
      ...files,
      ...app({ ios: { infoPlist: { NSPhotoLibraryAddUsageDescription: 'save' } } }),
    });
    expect(ok).toEqual([]);
    const bad = runRule(iosUsageDescriptions, { ...files, ...app({}) });
    expect(bad).toHaveLength(1);
    expect(bad[0]?.message).toContain('NSPhotoLibraryAddUsageDescription');
    expect(bad[0]?.severity).toBe('error');
  });
  it('reading the library still requires NSPhotoLibraryUsageDescription', () => {
    const f = runRule(iosUsageDescriptions, {
      'package.json': pkg(['expo-media-library']),
      'src/a.ts': "import { getAssetsAsync, saveToLibraryAsync } from 'expo-media-library';\n",
      ...app({ ios: { infoPlist: { NSPhotoLibraryAddUsageDescription: 'save' } } }),
    });
    expect(f[0]?.message).toContain('NSPhotoLibraryUsageDescription');
    expect(f[0]?.severity).toBe('error');
  });
  it('downgrades to info when the package is never imported', () => {
    const f = runRule(iosUsageDescriptions, {
      'package.json': pkg(['expo-sensors']),
      'src/a.ts': "import React from 'react';\n",
      ...app({}),
    });
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe('info');
  });
  it('missing NSPhotoLibraryUsageDescription for an imported image-picker is still an error', () => {
    const f = runRule(iosUsageDescriptions, {
      'package.json': pkg(['expo-image-picker']),
      'src/a.tsx': "import * as ImagePicker from 'expo-image-picker';\n",
      ...app({ ios: { infoPlist: { NSCameraUsageDescription: 'c' } } }),
    });
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('NSPhotoLibraryUsageDescription');
    expect(f[0]?.severity).toBe('error');
  });
});

describe('fix 8: extends-only base profiles', () => {
  const files = (build: object) => ({
    'package.json': pkg(['expo-updates']),
    'eas.json': { build },
  });
  const chan = (f: { message: string }[]) => f.filter((x) => x.message.includes('"channel"'));
  it('does not report the shared base, reports the leaf missing channel', () => {
    const f = chan(
      runRule(
        easConfig,
        files({
          base: {},
          preview: { extends: 'base', channel: 'preview' },
          production: { extends: 'base' },
        }),
      ),
    );
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('build.production');
  });
  it('accepts a channel inherited from the base', () => {
    expect(
      chan(
        runRule(easConfig, files({ base: { channel: 'main' }, production: { extends: 'base' } })),
      ),
    ).toEqual([]);
  });
  it('still reports a standalone profile with no channel', () => {
    const f = chan(runRule(easConfig, files({ production: {} })));
    expect(f).toHaveLength(1);
  });
});
