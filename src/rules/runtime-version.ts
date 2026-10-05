import type { RawFinding, Rule } from '../types.js';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});

export const runtimeVersion: Rule = {
  id: 'runtime-version',
  title: 'runtimeVersion and updates config are valid for expo-updates',
  defaultSeverity: 'error',
  check(ctx) {
    const out: RawFinding[] = [];
    const file = ctx.config.file ?? undefined;
    if (!ctx.config.file) return out;
    const expo = ctx.config.expo;
    const dyn = ctx.config.dynamic;
    const updates = obj(expo.updates);

    if (!ctx.deps.has('expo-updates')) {
      if (typeof updates.url === 'string' && updates.url) {
        out.push({
          severity: 'warn',
          file,
          message:
            'updates.url is set but expo-updates is not installed; OTA updates will not work.',
          fix: 'Run `npx expo install expo-updates` or remove expo.updates.',
        });
      }
      return out;
    }

    const ios = obj(expo.ios);
    const android = obj(expo.android);
    const top = expo.runtimeVersion;
    const hasAny =
      top !== undefined || ios.runtimeVersion !== undefined || android.runtimeVersion !== undefined;
    if (!hasAny) {
      if (!dyn) {
        out.push({
          file,
          message: 'expo-updates is installed but runtimeVersion is not set.',
          fix: 'Add expo.runtimeVersion, e.g. { "policy": "appVersion" } or { "policy": "fingerprint" }.',
        });
      }
    } else {
      const candidates: [string, unknown][] = [
        ['runtimeVersion', top],
        ['ios.runtimeVersion', ios.runtimeVersion],
        ['android.runtimeVersion', android.runtimeVersion],
      ];
      for (const [where, rv] of candidates) {
        if (rv === undefined) continue;
        const policy = obj(rv).policy;
        if (typeof rv === 'object' && typeof policy !== 'string') {
          out.push({
            file,
            message: `${where} is an object without a string "policy".`,
            fix: 'Use a string runtimeVersion or { "policy": "appVersion" | "nativeVersion" | "sdkVersion" | "fingerprint" }.',
          });
          continue;
        }
        if (typeof rv === 'string' && !rv.trim()) {
          out.push({
            file,
            message: `${where} is an empty string.`,
            fix: 'Set a non-empty runtime version.',
          });
        }
        if (policy === 'appVersion' && !expo.version && !dyn) {
          out.push({
            file,
            message: `${where} policy "appVersion" requires expo.version, which is missing.`,
            fix: 'Add expo.version (e.g. "1.0.0").',
          });
        }
        if (policy === 'nativeVersion') {
          const needIos = where !== 'android.runtimeVersion';
          const needAnd = where !== 'ios.runtimeVersion';
          if (!dyn && needIos && !ios.buildNumber) {
            out.push({
              file,
              message: `${where} policy "nativeVersion" needs ios.buildNumber, which is missing.`,
              fix: 'Add expo.ios.buildNumber or switch policy to "fingerprint".',
            });
          }
          if (!dyn && needAnd && android.versionCode === undefined) {
            out.push({
              file,
              message: `${where} policy "nativeVersion" needs android.versionCode, which is missing.`,
              fix: 'Add expo.android.versionCode or switch policy to "fingerprint".',
            });
          }
        }
      }
      if (
        typeof top === 'string' &&
        (typeof ios.runtimeVersion === 'object' || typeof android.runtimeVersion === 'object')
      ) {
        out.push({
          severity: 'warn',
          file,
          message:
            'A fixed top-level runtimeVersion is combined with a platform runtimeVersion policy; platforms may drift apart.',
          fix: 'Use one scheme consistently across platforms.',
        });
      }
    }

    if (!updates.url && !dyn) {
      out.push({
        severity: 'warn',
        file,
        message: 'expo-updates is installed but expo.updates.url is not set.',
        fix: 'Run `eas update:configure` to set updates.url (and EAS project id).',
      });
    }
    return out;
  },
};
