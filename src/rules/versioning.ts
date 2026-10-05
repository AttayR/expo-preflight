import type { RawFinding, Rule } from '../types.js';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});

export const versioning: Rule = {
  id: 'versioning',
  title: 'version, buildNumber and versionCode are present and well-formed',
  defaultSeverity: 'error',
  check(ctx) {
    const out: RawFinding[] = [];
    const file = ctx.config.file ?? undefined;
    if (!ctx.config.file) {
      out.push({
        file: 'app.json',
        message: 'No app.json / app.config.* found.',
        fix: 'Run this from your Expo project root or pass the path: expo-preflight ./my-app.',
      });
      return out;
    }
    const expo = ctx.config.expo;
    const dyn = ctx.config.dynamic;
    const ios = obj(expo.ios);
    const android = obj(expo.android);
    const missingOk = dyn; // cannot tell if a dynamic config computes it

    if (expo.version === undefined) {
      // Expo falls back to package.json "version" when expo.version is unset.
      const pkgVersion = ctx.packageJson?.version;
      const hasPkgVersion = typeof pkgVersion === 'string' && pkgVersion !== '';
      if (!missingOk && !hasPkgVersion) {
        out.push({
          severity: ctx.isExample ? 'info' : undefined,
          file,
          message: ctx.isExample
            ? 'expo.version is missing (example/demo project).'
            : 'expo.version is missing.',
          fix: 'Add expo.version, e.g. "1.0.0".',
        });
      }
    } else if (
      typeof expo.version !== 'string' ||
      !/^\d+\.\d+(\.\d+)?([-+][\w.]+)?$/.test(expo.version)
    ) {
      out.push({
        file,
        message: `expo.version "${String(expo.version)}" is not a valid version (expected e.g. 1.2.3).`,
        fix: 'Use a semver-style string such as "1.2.3".',
      });
    }

    const source = obj(obj(ctx.eas.json).cli).appVersionSource;
    const local = source === 'local';
    if (ctx.eas.json && source === undefined) {
      out.push({
        severity: 'warn',
        file: 'eas.json',
        message: 'cli.appVersionSource is not set in eas.json.',
        fix: 'Set "cli": { "appVersionSource": "remote" } (recommended) or "local".',
      });
    }

    const bn = ios.buildNumber;
    if (bn === undefined) {
      if (local && !missingOk) {
        out.push({
          severity: 'warn',
          file,
          message: 'appVersionSource is "local" but ios.buildNumber is missing.',
          fix: 'Add expo.ios.buildNumber (e.g. "1") and bump it each release.',
        });
      }
    } else if (typeof bn !== 'string' || !/^\d+(\.\d+){0,2}$/.test(bn)) {
      out.push({
        file,
        message: `ios.buildNumber ${JSON.stringify(bn)} must be a numeric string such as "12" or "1.2.3".`,
        fix: 'Quote it and use digits/dots only.',
      });
    }

    const vc = android.versionCode;
    if (vc === undefined) {
      if (local && !missingOk) {
        out.push({
          severity: 'warn',
          file,
          message: 'appVersionSource is "local" but android.versionCode is missing.',
          fix: 'Add expo.android.versionCode (positive integer) and bump it each release.',
        });
      }
    } else if (typeof vc !== 'number' || !Number.isInteger(vc) || vc < 1) {
      out.push({
        file,
        message: `android.versionCode ${JSON.stringify(vc)} must be a positive integer (not a string).`,
        fix: 'Use a number, e.g. "versionCode": 3.',
      });
    }
    return out;
  },
};
