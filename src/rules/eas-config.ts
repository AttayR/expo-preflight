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

const esc = (n: string) => n.replace(/[$]/g, '\\$&');

/**
 * Env vars the config reads WITHOUT a safe fallback: skips `process.env.X ?? ...`, `|| ...`,
 * and comparisons against a literal (`process.env.X === 'production'`).
 */
export function requiredEnvVars(text: string): string[] {
  return referencedEnvVars(text).filter((n) => {
    const ref = `(?:process\\.env\\.${esc(n)}\\b|process\\.env\\[['"]${esc(n)}['"]\\])`;
    const lit = `['"\`][^'"\`]*['"\`]`;
    const safe = new RegExp(
      `${ref}\\s*(?:\\?\\?|\\|\\||[!=]==?\\s*${lit})|${lit}\\s*[!=]==?\\s*${ref}`,
      'g',
    );
    const all = new RegExp(ref, 'g');
    const total = (text.match(all) ?? []).length;
    const safeCount = (text.match(safe) ?? []).length;
    // A bare EXPO_PUBLIC_X mention with no process.env access (total 0) is still a reference.
    return total === 0 || safeCount < total;
  });
}

function check(ctx: ProjectContext): RawFinding[] {
  const out: RawFinding[] = [];
  const { eas } = ctx;
  if (!eas.exists) {
    out.push({
      severity: ctx.isExample ? 'info' : 'warn',
      file: 'eas.json',
      message: ctx.isExample
        ? 'eas.json not found (example/demo project); `eas build` and `eas update` need it.'
        : 'eas.json not found; `eas build` and `eas update` need it.',
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
  let usesEnvironment = false;
  const extended = new Set<string>();
  for (const n of names) {
    const ext = obj(build[n]).extends;
    if (typeof ext === 'string') extended.add(ext);
  }
  /** Resolve a field through the `extends` chain (cycle-safe). */
  const inherited = (name: string, field: string): unknown => {
    const seen = new Set<string>();
    let cur: string | undefined = name;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      const prof = obj(build[cur]);
      if (prof[field] !== undefined) return prof[field];
      cur = typeof prof.extends === 'string' ? prof.extends : undefined;
    }
    return undefined;
  };
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
    if (p.environment !== undefined) usesEnvironment = true;
    for (const k of Object.keys(obj(p.env))) definedEnv.add(k);
    for (const plat of ['ios', 'android'])
      for (const k of Object.keys(obj(obj(p[plat]).env))) definedEnv.add(k);
    // Only leaf profiles are judged: a profile that others extend is a shared base.
    if (
      hasUpdates &&
      !extended.has(name) &&
      inherited(name, 'channel') === undefined &&
      inherited(name, 'developmentClient') !== true &&
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

  // Profiles with `environment` pull variables from EAS servers, which cannot be checked offline.
  const envVars = usesEnvironment ? [] : requiredEnvVars(ctx.config.text);
  for (const v of envVars) {
    if (!definedEnv.has(v)) {
      out.push({
        severity: 'info',
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
