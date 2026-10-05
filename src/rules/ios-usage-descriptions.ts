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
        const scannable = ctx.source.scanned;
        // Keys without an API map are always considered triggered by the package being used.
        const triggered = !k.apis || ctx.source.triggered.has(`${pkg}|${k.key}`);
        const apiList = k.apis ? k.apis.slice(0, 4).join(', ') : '';
        if (k.onlyIfDetected && !triggered) continue;
        let severity: 'error' | 'warn' | 'info';
        let message: string;
        if (unused) {
          severity = 'info';
          message = `${pkg} is installed but never imported in app sources; ${k.key} is not set (ignore if unused).`;
        } else if (scannable && !triggered) {
          severity = 'info';
          message = `${pkg}: ${k.key} is not set; it is only needed if you call ${apiList}${k.apis && k.apis.length > 4 ? ', ...' : ''}.`;
        } else if (pluginOnly) {
          severity = 'warn';
          message = `${pkg}: ${k.key} not customised; the config plugin will use a generic default string.`;
        } else if (!scannable && k.apis) {
          severity = 'warn';
          message = `${pkg} is installed but ${k.key} is not set; no app sources were found to check whether the API is used (needed if you call ${apiList}).`;
        } else {
          severity = 'error';
          message = `${pkg} is installed but ${k.key} is not set; App Store submission will be rejected if the API is used.`;
        }
        out.push({
          severity,
          file: ctx.config.file,
          message,
          fix: k.pluginOption
            ? `Set expo.ios.infoPlist.${k.key} or the "${k.pluginOption}" option of the ${pkg} plugin in your app config.`
            : `Set expo.ios.infoPlist.${k.key} in your app config.`,
        });
      }
    }
    return out;
  },
};
