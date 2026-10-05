import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SECRET_FILE_PATTERNS } from '../data/packages.js';
import type { RawFinding, Rule, Severity } from '../types.js';

function globToRegex(pat: string): RegExp {
  let re = '';
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i] as string;
    if (c === '*') {
      if (pat[i + 1] === '*') {
        re += '.*';
        i++;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function ignored(gitignore: string, rel: string): boolean {
  const lines = gitignore
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('!'));
  const base = rel.split('/').pop() ?? rel;
  return lines.some((l) => {
    const pat = l
      .replace(/^\//, '')
      .replace(/\/$/, '')
      .replace(/^\*\*\//, '');
    if (!pat) return false;
    const re = globToRegex(pat);
    return pat.includes('/') ? re.test(rel) : re.test(base);
  });
}

const SENSITIVE_KEY = /pass(word|phrase)?|secret|private_?key|key_?alias|keystore|token|api_?key/i;

function hasSensitiveField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSensitiveField);
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => SENSITIVE_KEY.test(k) || hasSensitiveField(v));
  }
  return false;
}

/** True/false when the JSON file can be read; null when unreadable or not JSON. */
function jsonHasSecrets(root: string, rel: string): boolean | null {
  try {
    return hasSensitiveField(JSON.parse(readFileSync(join(root, rel), 'utf8')));
  } catch {
    return null;
  }
}

export const secretsHygiene: Rule = {
  id: 'secrets-hygiene',
  title: 'Secrets and credentials are not committed',
  defaultSeverity: 'error',
  check(ctx) {
    const out: RawFinding[] = [];
    const match = (f: string) =>
      SECRET_FILE_PATTERNS.find((p) => p.re.test(f) && !p.exempt?.test(f));
    const tracked = new Set<string>();
    if (ctx.trackedFiles) {
      for (const f of ctx.trackedFiles) {
        const m = match(f);
        if (!m) continue;
        tracked.add(f);
        let severity: Severity = m.severity;
        if (m.inspectJson && jsonHasSecrets(ctx.root, f) === false) severity = 'info';
        out.push({
          severity,
          file: f,
          message:
            severity === 'info'
              ? `${m.label} is tracked by git (${f}) but has no key/password-like fields. Contents are not shown.`
              : `${m.label} is tracked by git (${f}). Contents are not shown.`,
          fix: `Run \`git rm --cached ${f}\`, add it to .gitignore, and rotate any credentials it contained. Use EAS secrets / file env vars instead.`,
        });
      }
    }
    for (const f of ctx.diskFiles) {
      if (tracked.has(f)) continue;
      const m = match(f);
      if (!m) continue;
      if (ctx.gitignore !== null && ignored(ctx.gitignore, f)) continue;
      out.push({
        severity: 'warn',
        file: f,
        message: `${m.label} exists (${f}) and is not covered by .gitignore.`,
        fix: `Add a .gitignore entry for ${f.split('/').pop()} before committing.`,
      });
    }
    if (ctx.gitignore === null) {
      out.push({
        severity: 'warn',
        file: '.gitignore',
        message: 'No .gitignore found (also checked parent directories up to the git root).',
        fix: 'Create .gitignore with at least: .env*, *.jks, *.keystore, *.p8, *.p12, google-services.json.',
      });
    }
    // Only warn about .gitignore coverage when a real (non-example) .env file exists in the
    // repo; `.env*.local` and `.env*` style patterns count as ignoring env files.
    const envTracked = [...tracked].some((f) => /(^|\/)\.env(\.[^/]+)?$/.test(f));
    if (ctx.gitignore !== null && envTracked && !ignored(ctx.gitignore, '.env')) {
      out.push({
        severity: 'warn',
        file: '.gitignore',
        message: '.gitignore does not ignore .env files.',
        fix: 'Add ".env" and ".env.*" (and "!.env.example") to .gitignore.',
      });
    }
    return out;
  },
};
