import { ANDROID_COVERS, ANDROID_PERMISSIONS, DANGEROUS_ANDROID } from '../data/packages.js';
import type { RawFinding, Rule } from '../types.js';

export const androidPermissions: Rule = {
  id: 'android-permissions',
  title: 'Android permissions match installed packages',
  defaultSeverity: 'warn',
  check(ctx) {
    const out: RawFinding[] = [];
    const perms = ctx.config.androidPermissions;
    const file = ctx.config.file ?? undefined;
    if (!ctx.config.file) return out;
    // Dynamic config where no permissions block could be located: cannot judge.
    const declared = new Set(perms ?? []);
    if (perms === null && ctx.config.dynamic) return out;

    const covered = new Set<string>();
    for (const [pkg, required] of Object.entries(ANDROID_PERMISSIONS)) {
      if (!ctx.deps.has(pkg)) continue;
      // A registered config plugin adds its own permissions, so "missing" cannot be judged.
      const hasPlugin = ctx.config.plugins.includes(pkg);
      for (const req of required) {
        const options = req.split('|');
        options.forEach((o) => covered.add(o));
        if (hasPlugin) continue;
        if (!options.some((o) => declared.has(o))) {
          const bleNote = req.startsWith('BLUETOOTH_')
            ? ' (required on Android 12+ / API 31+)'
            : '';
          out.push({
            file,
            message: `${pkg} is installed but android.permissions does not include ${options.join(' or ')}${bleNote}.`,
            fix: `Add "${options[0]}" to expo.android.permissions (some libraries add it via manifest merge; verify in your build).`,
          });
        }
      }
    }
    for (const [pkg, extra] of Object.entries(ANDROID_COVERS)) {
      if (ctx.deps.has(pkg)) extra.forEach((o) => covered.add(o));
    }
    for (const p of declared) {
      const reason = DANGEROUS_ANDROID[p];
      if (reason) {
        out.push({
          file,
          message: `android.permissions declares ${p}. ${reason}.`,
          fix: `Remove ${p} unless you need it and have completed the Play Console declaration.`,
        });
      } else if (
        !covered.has(p) &&
        /^(CAMERA|RECORD_AUDIO|ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION|READ_CONTACTS|WRITE_CONTACTS|READ_CALENDAR|WRITE_CALENDAR|BLUETOOTH_SCAN|BLUETOOTH_CONNECT|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE)$/.test(
          p,
        )
      ) {
        out.push({
          file,
          message: `android.permissions declares ${p} but no installed package in the known table uses it.`,
          fix: `Remove ${p} if unused; unnecessary runtime permissions hurt Play review and user trust.`,
        });
      }
    }
    return out;
  },
};
