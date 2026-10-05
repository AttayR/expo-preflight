import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
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

function gitTopLevel(root: string): string | null {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out ? realpathSync(out) : null;
  } catch {
    return null;
  }
}

/** Directories from `root` up to (and including) the git root; just `root` outside a repo. */
function dirChain(root: string, top: string | null): string[] {
  const start = realpathSafe(root);
  if (!top) return [start];
  const chain: string[] = [];
  let dir = start;
  for (let i = 0; i < 20; i++) {
    chain.push(dir);
    if (dir === top) return chain;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return [start];
}

function realpathSafe(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

const ENV_EXAMPLE_FILE =
  /^\.env(\..+)?\.(example|sample|template)$|^\.env\.(example|sample|template)$/;

function loadEnvExample(dirs: string[]): Set<string> {
  const vars = new Set<string>();
  for (const dir of dirs) {
    let names: string[];
    try {
      names = readdirSync(dir).filter((n) => ENV_EXAMPLE_FILE.test(n));
    } catch {
      continue;
    }
    for (const f of names) {
      const t = readText(join(dir, f));
      if (!t) continue;
      for (const line of t.split('\n')) {
        const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
        if (m?.[1]) vars.add(m[1]);
      }
    }
  }
  return vars;
}

const EXAMPLE_NAME = /(^|[-_.])(examples?|demos?|samples?)([-_.]|$)/i;

function detectExample(root: string, top: string | null): boolean {
  const start = realpathSafe(root);
  const names = [basename(start)];
  if (top && top !== start) {
    names.push(...relative(top, start).split(/[\\/]/), basename(top));
  }
  return names.some((n) => EXAMPLE_NAME.test(n));
}

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/;
const MEDIA_API =
  /\b(getAssetsAsync|getAlbumsAsync|getAlbumAsync|getAssetInfoAsync|getMomentsAsync|saveToLibraryAsync|createAssetAsync|createAlbumAsync|addAssetsToAlbumAsync|deleteAssetsAsync|removeAssetsFromAlbumAsync)\b/g;

function scanSource(root: string): {
  scanned: boolean;
  imported: Set<string>;
  mediaApis: Set<string>;
} {
  const imported = new Set<string>();
  const mediaApis = new Set<string>();
  let count = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > 6 || count > 3000) return;
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
        if (!SKIP_DIRS.has(e) && !e.startsWith('.')) walk(full, depth + 1);
      } else if (SOURCE_EXT.test(e) && st.size < 500_000 && !/\.d\.ts$/.test(e)) {
        const t = readText(full);
        if (t === null) continue;
        count++;
        const mine = new Set<string>();
        for (const m of t.matchAll(
          /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]((?:@[\w.-]+\/)?[\w.-]+)(?:\/[^'"]*)?['"]/g,
        ))
          if (m[1]) mine.add(m[1]);
        for (const n of mine) imported.add(n);
        if (mine.has('expo-media-library'))
          for (const m of t.matchAll(MEDIA_API)) if (m[1]) mediaApis.add(m[1]);
      }
    }
  };
  walk(root, 0);
  return { scanned: count > 0, imported, mediaApis };
}

export function loadProject(root: string): ProjectContext {
  const top = gitTopLevel(root);
  const dirs = dirChain(root, top);
  const gitignores = dirs.map((d) => readText(join(d, '.gitignore'))).filter((t) => t !== null);
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
    gitignore: gitignores.length ? gitignores.join('\n') : null,
    trackedFiles: gitTracked(root),
    diskFiles: scanDisk(root),
    envExampleVars: loadEnvExample(dirs),
    isExample: detectExample(root, top),
    source: scanSource(root),
  };
}
