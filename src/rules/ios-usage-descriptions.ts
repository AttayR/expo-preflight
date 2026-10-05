import { IOS_USAGE } from '../data/packages.js';
import type { RawFinding, Rule } from '../types.js';

export const iosUsageDescriptions: Rule = {
  id: 'ios-usage-descriptions',
  title: 'iOS usage description strings present for installed packages',
  defaultSeverity: 'error',
  check(ctx) {
    const out: RawFinding[] = [];
    if (!ctx.config.file) return out;
    const hay = ctx.config.text + '\n' + JSON.stringify(ctx.config.expo);
    for (const [pkg, keys] of Object.entries(IOS_USAGE)) {
      if (!ctx.deps.has(pkg)) continue;
      const missing = keys.filter((k) => {
        if (hay.includes(k.key)) return false;
        // Config plugin option for this package supplies the string.
        if (k.pluginOption && ctx.config.plugins.includes(pkg) && hay.includes(k.pluginOption)) {
          return false;
        }
        return true;
      });
      // Where the package's config plugin is registered without options, Expo injects a
      // generic default string: App Review may still reject it, so downgrade to a warning.
      const pluginOnly = ctx.config.plugins.includes(pkg);
      for (const k of missing) {
        out.push({
          severity: pluginOnly ? 'warn' : 'error',
          file: ctx.config.file,
          message: pluginOnly
            ? `${pkg}: ${k.key} not customised; the config plugin will use a generic default string.`
            : `${pkg} is installed but ${k.key} is not set; App Store submission will be rejected if the API is used.`,
          fix: k.pluginOption
            ? `Set expo.ios.infoPlist.${k.key} or the "${k.pluginOption}" option of the ${pkg} plugin in your app config.`
            : `Set expo.ios.infoPlist.${k.key} in your app config.`,
        });
      }
    }
    return out;
  },
};
