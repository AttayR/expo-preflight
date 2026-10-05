import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SECRET_FILE_PATTERNS } from './data/packages.js';
import type { AppConfig, ProjectContext } from './types.js';

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function parseJson(text: string): { value: Record<string, unknown> | null; error: string | null } {
  try {
    const v: unknown = JSON.parse(text);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return { value: v as Record<string, unknown>, error: null };
    }
    return { value: null, error: 'top-level value is not an object' };
  } catch (e) {
    return { value: null, error: (e as Error).message };
  }
}

/** Returns the text inside the first balanced [...] following `key:`/`"key":`; null if not found. */
export function extractBlock(text: string, key: string): string | null {
  const m = new RegExp(`['"]?\\b${key}['"]?\\s*:\\s*\\[`).exec(text);
  if (!m) return null;
  let depth = 1;
  const start = m.index + m[0].length;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return text.slice(start, i);
  }
  return null;
}

function strField(text: string, key: string): string | undefined {
  return new RegExp(`\\b${key}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`).exec(text)?.[1];
}

function pluginNames(block: string): string[] {
  const names = new Set<string>();
  // Top-level string entries and first element of nested arrays.
  const re = /(\[\s*)?['"]((?:@[\w.-]+\/)?[\w.-]+(?:\/[\w./-]+)?)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const name = m[2];
    if (name && /^(@|expo|react-native|[a-z])/.test(name) && !name.includes(' ')) {
      // Only accept names that look like packages (skip option strings by requiring package-ish shape).
      if (m[1] || /^[\w@./-]+$/.test(name)) names.add(name);
    }
  }
  return [...names];
}

function loadConfig(root: string): AppConfig {
  const empty: AppConfig = {
    file: null,
    expo: {},
    text: '',
    dynamic: false,
    found: new Set(),
    plugins: [],
    androidPermissions: null,
  };
  const files: string[] = [];
  let expo: Record<string, unknown> = {};
  let text = '';
  let hasStatic = false;
  for (const name of ['app.json', 'app.config.json']) {
    const t = readText(join(root, name));
    if (t === null) continue;
    files.push(name);
    text += t + '\n';
    const { value } = parseJson(t);
    if (value && !hasStatic) {
      const inner = value.expo;
      expo = inner && typeof inner === 'object' ? (inner as Record<string, unknown>) : value;
      hasStatic = true;
    }
  }
  let dynamicText = '';
  for (const name of ['app.config.js', 'app.config.ts', 'app.config.mjs', 'app.config.cjs']) {
    const t = readText(join(root, name));
    if (t === null) continue;
    files.push(name);
    dynamicText += t + '\n';
  }
  if (files.length === 0) return empty;
  text += dynamicText;
  const dynamic = dynamicText !== '';
  const found = new Set<string>();
  const cfg: AppConfig = {
    file: files.join(', '),
    expo,
    text,
    dynamic,
    found,
    plugins: [],
    androidPermissions: null,
  };

  const plugins = new Set<string>();
  const perms = new Set<string>();
  let permsFound = false;
  const staticPlugins = expo.plugins;
  if (Array.isArray(staticPlugins)) {
    for (const p of staticPlugins) {
      if (typeof p === 'string') plugins.add(p);
      else if (Array.isArray(p) && typeof p[0] === 'string') plugins.add(p[0]);
    }
  }
  const android = expo.android as Record<string, unknown> | undefined;
  if (android && Array.isArray(android.permissions)) {
    permsFound = true;
    for (const p of android.permissions) if (typeof p === 'string') perms.add(normPerm(p));
  }

  if (dynamic) {
    const merged = { ...expo };
    const set = (path: string, v: unknown, apply: () => void) => {
      if (v !== undefined) {
        found.add(path);
        apply();
      }
    };
    const version = strField(dynamicText, 'version');
    const buildNumber = strField(dynamicText, 'buildNumber');
    const vc = /\bversionCode\s*:\s*(['"]?)(\d+)\1/.exec(dynamicText);
    const rv = strField(dynamicText, 'runtimeVersion');
    const policy = strField(dynamicText, 'policy');
    const url = strField(dynamicText, 'url');
    set('version', version, () => (merged.version = version));
    set('ios.buildNumber', buildNumber, () => {
      merged.ios = { ...(merged.ios as object), buildNumber };
    });
    set('android.versionCode', vc?.[2], () => {
      merged.android = { ...(merged.android as object), versionCode: Number(vc?.[2]) };
    });
    set('runtimeVersion', rv ?? policy, () => {
      merged.runtimeVersion = rv ?? { policy };
    });
    set('updates.url', url, () => {
      merged.updates = { ...(merged.updates as object), url };
    });
    cfg.expo = merged;
    const pb = extractBlock(dynamicText, 'plugins');
    if (pb) for (const n of pluginNames(pb)) plugins.add(n);
    const permBlock = extractBlock(dynamicText, 'permissions');
    if (permBlock !== null) {
      permsFound = true;
      for (const m of permBlock.matchAll(/['"]([\w.]+)['"]/g)) if (m[1]) perms.add(normPerm(m[1]));
    }
    // Statically-defined values count as found too.
    if (hasStatic) {
      for (const k of ['version', 'runtimeVersion']) if (expo[k] !== undefined) found.add(k);
    }
  }
  cfg.plugins = [...plugins];
  cfg.androidPermissions = permsFound ? [...perms] : null;
  return cfg;
}

export function normPerm(p: string): string {
  return p.replace(/^android\.permission\./, '');
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'Pods', 'build', 'dist', '.expo']);

function scanDisk(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 4) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(e)) walk(full, depth + 1);
      } else {
        const rel = relative(root, full).split('\\').join('/');
        if (SECRET_FILE_PATTERNS.some((p) => p.re.test(rel))) out.push(rel);
      }
    }
  };
  walk(root, 0);
  return out.sort();
}

function gitTracked(root: string): string[] | null {
  try {
    const out = execFileSync('git', ['ls-files'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

function loadEnvExample(root: string): Set<string> {
  const vars = new Set<string>();
  for (const f of ['.env.example', '.env.sample', '.env.template']) {
    const t = readText(join(root, f));
    if (!t) continue;
    for (const line of t.split('\n')) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
      if (m?.[1]) vars.add(m[1]);
    }
  }
  return vars;
}

export function loadProject(root: string): ProjectContext {
  const pkgText = readText(join(root, 'package.json'));
  const pkg = pkgText ? parseJson(pkgText).value : null;
  const deps = new Set<string>();
  const dependencies: Record<string, string> = {};
  if (pkg) {
    for (const k of ['dependencies', 'devDependencies']) {
      const d = pkg[k];
      if (d && typeof d === 'object') {
        for (const [n, v] of Object.entries(d as Record<string, string>)) {
          deps.add(n);
          dependencies[n] = String(v);
        }
      }
    }
  }
  const easPath = join(root, 'eas.json');
  const easText = existsSync(easPath) ? readText(easPath) : null;
  const eas =
    easText === null
      ? { exists: false, json: null, error: null }
      : (() => {
          const r = parseJson(easText);
          return { exists: true, json: r.value, error: r.error };
        })();
  return {
    root,
    packageJson: pkg ? { ...pkg, dependencies } : null,
    deps,
    config: loadConfig(root),
    eas,
    gitignore: readText(join(root, '.gitignore')),
    trackedFiles: gitTracked(root),
    diskFiles: scanDisk(root),
    envExampleVars: loadEnvExample(root),
  };
}
