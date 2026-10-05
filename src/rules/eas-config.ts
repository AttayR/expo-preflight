import type { ProjectContext, RawFinding, Rule } from '../types.js';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};

const IGNORED_ENV = new Set(['NODE_ENV', 'CI', 'HOME', 'PATH']);

export function referencedEnvVars(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g))
    if (m[1]) names.add(m[1]);
  for (const m of text.matchAll(/process\.env\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\]/g))
    if (m[1]) names.add(m[1]);
  for (const m of text.matchAll(/\bEXPO_PUBLIC_[A-Za-z0-9_]+/g)) names.add(m[0]);
  return [...names].filter((n) => !IGNORED_ENV.has(n) && !n.startsWith('EAS_BUILD'));
}

function check(ctx: ProjectContext): RawFinding[] {
  const out: RawFinding[] = [];
  const { eas } = ctx;
  if (!eas.exists) {
    out.push({
      file: 'eas.json',
      message: 'eas.json not found; `eas build` and `eas update` need it.',
      fix: 'Run `eas build:configure` to create eas.json.',
    });
    return out;
  }
  if (!eas.json) {
    out.push({
      file: 'eas.json',
      message: `eas.json could not be parsed: ${eas.error ?? 'invalid JSON'}.`,
      fix: 'Fix the JSON syntax (eas.json does not allow comments or trailing commas).',
    });
    return out;
  }
  const build = obj(eas.json.build);
  const names = Object.keys(build);
  if (names.length === 0) {
    out.push({
      file: 'eas.json',
      message: 'eas.json has no "build" profiles.',
      fix: 'Add at least a "production" profile under "build".',
    });
  }
  const definedEnv = new Set<string>(ctx.envExampleVars);
  const hasUpdates = ctx.deps.has('expo-updates');
  for (const name of names) {
    const p = obj(build[name]);
    if (typeof build[name] !== 'object' || build[name] === null) {
      out.push({
        file: 'eas.json',
        message: `build.${name} must be an object.`,
        fix: 'Use {} for an empty profile.',
      });
      continue;
    }
    if (typeof p.extends === 'string' && !(p.extends in build)) {
      out.push({
        file: 'eas.json',
        message: `build.${name} extends "${p.extends}", which does not exist.`,
        fix: 'Fix the profile name or define the base profile.',
      });
    }
    if (
      p.distribution !== undefined &&
      p.distribution !== 'store' &&
      p.distribution !== 'internal'
    ) {
      out.push({
        file: 'eas.json',
        message: `build.${name}.distribution must be "store" or "internal".`,
        fix: 'Set distribution to "store" or "internal".',
      });
    }
    for (const k of Object.keys(obj(p.env))) definedEnv.add(k);
    for (const plat of ['ios', 'android'])
      for (const k of Object.keys(obj(obj(p[plat]).env))) definedEnv.add(k);
    if (
      hasUpdates &&
      p.channel === undefined &&
      p.extends === undefined &&
      name !== 'development'
    ) {
      out.push({
        severity: 'warn',
        file: 'eas.json',
        message: `build.${name} has no "channel" but expo-updates is installed; builds will not receive EAS Update.`,
        fix: `Add "channel": "${name}" to build.${name}.`,
      });
    }
  }

  const submit = obj(eas.json.submit);
  for (const [name, raw] of Object.entries(submit)) {
    const p = obj(raw);
    const ios = obj(p.ios);
    const android = obj(p.android);
    if (Object.keys(ios).length && !ios.ascAppId && !ios.appleId && !ios.ascApiKeyPath) {
      out.push({
        severity: 'warn',
        file: 'eas.json',
        message: `submit.${name}.ios has no ascAppId / appleId / ascApiKeyPath.`,
        fix: 'Set ios.ascAppId (and API key or Apple ID) so `eas submit` can run non-interactively.',
      });
    }
    if (Object.keys(android).length) {
      if (!android.serviceAccountKeyPath) {
        out.push({
          severity: 'warn',
          file: 'eas.json',
          message: `submit.${name}.android has no serviceAccountKeyPath.`,
          fix: 'Set android.serviceAccountKeyPath to your Google service account JSON (keep it out of git).',
        });
      }
      const tracks = ['production', 'beta', 'alpha', 'internal'];
      if (android.track !== undefined && !tracks.includes(String(android.track))) {
        out.push({
          file: 'eas.json',
          message: `submit.${name}.android.track "${String(android.track)}" is not one of ${tracks.join(', ')}.`,
          fix: 'Use a valid Play track.',
        });
      }
    }
  }
  if (names.includes('production') && !('production' in submit) && !('submit' in eas.json)) {
    out.push({
      severity: 'warn',
      file: 'eas.json',
      message: 'No "submit" section; `eas submit` will need interactive input.',
      fix: 'Add "submit": { "production": {} } and fill in store credentials.',
    });
  }

  for (const v of referencedEnvVars(ctx.config.text)) {
    if (!definedEnv.has(v)) {
      out.push({
        severity: 'warn',
        file: ctx.config.file ?? undefined,
        message: `App config references ${v}, which is not defined in any eas.json build env or .env.example.`,
        fix: `Add ${v} to build.<profile>.env in eas.json (or EAS environment variables) and list it in .env.example.`,
      });
    }
  }
  return out;
}

export const easConfig: Rule = {
  id: 'eas-config',
  title: 'eas.json parses, profiles are sane, referenced env vars are defined',
  defaultSeverity: 'error',
  check,
};
