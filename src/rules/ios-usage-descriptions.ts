import { IOS_USAGE, MEDIA_SAVE_APIS, MEDIA_SAVE_KEY, MICROPHONE_FAMILY } from '../data/packages.js';
import type { IosKey } from '../data/packages.js';
import type { RawFinding, Rule } from '../types.js';

export const iosUsageDescriptions: Rule = {
  id: 'ios-usage-descriptions',
  title: 'iOS usage description strings present for installed packages',
  defaultSeverity: 'error',
  check(ctx) {
    const out: RawFinding[] = [];
    if (!ctx.config.file) return out;
    const hay = ctx.config.text + '\n' + JSON.stringify(ctx.config.expo);
    for (const [pkg, baseKeys] of Object.entries(IOS_USAGE)) {
      if (!ctx.deps.has(pkg)) continue;
      let keys: IosKey[] = baseKeys;
      // expo-media-library used only to save: the "add" key is what iOS needs.
      if (pkg === 'expo-media-library') {
        const apis = ctx.source.mediaApis;
        if (apis.size > 0 && [...apis].every((a) => MEDIA_SAVE_APIS.has(a))) {
          keys = [MEDIA_SAVE_KEY];
          // Either key satisfies a save-only app.
          if (hay.includes('NSPhotoLibraryUsageDescription')) keys = [];
        }
      }
      const missing = keys.filter((k) => {
        if (hay.includes(k.key)) return false;
        if (k.pluginOption) {
          // Config plugin option for this package supplies the string.
          if (ctx.config.plugins.includes(pkg) && hay.includes(k.pluginOption)) return false;
          // The microphone option is shared by the audio/camera family of plugins.
          if (
            k.key === 'NSMicrophoneUsageDescription' &&
            MICROPHONE_FAMILY.some((p) => ctx.config.plugins.includes(p)) &&
            hay.includes('microphonePermission')
          ) {
            return false;
          }
        }
        return true;
      });
      // Where the package's config plugin is registered without options, Expo injects a
      // generic default string: App Review may still reject it, so downgrade to a warning.
      const pluginOnly = ctx.config.plugins.includes(pkg);
      // Installed but never imported in app sources: likely unused, so only informational.
      const unused = ctx.source.scanned && !ctx.source.imported.has(pkg);
      for (const k of missing) {
        out.push({
          severity: unused ? 'info' : pluginOnly ? 'warn' : 'error',
          file: ctx.config.file,
          message: unused
            ? `${pkg} is installed but never imported in app sources; ${k.key} is not set (ignore if unused).`
            : pluginOnly
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
