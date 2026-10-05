import { SECRET_FILE_PATTERNS } from '../data/packages.js';
import type { RawFinding, Rule } from '../types.js';

function ignored(gitignore: string, rel: string): boolean {
  const lines = gitignore
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('!'));
  const base = rel.split('/').pop() ?? rel;
  return lines.some((l) => {
    const pat = l.replace(/^\//, '').replace(/\/$/, '');
    if (pat === rel || pat === base) return true;
    if (pat.startsWith('*.')) return base.endsWith(pat.slice(1));
    if (pat === '.env*' || pat === '.env.*') return base.startsWith('.env');
    if (pat === '**/' + base) return true;
    return false;
  });
}

export const secretsHygiene: Rule = {
  id: 'secrets-hygiene',
  title: 'Secrets and credentials are not committed',
  defaultSeverity: 'error',
  check(ctx) {
    const out: RawFinding[] = [];
    const match = (f: string) => SECRET_FILE_PATTERNS.find((p) => p.re.test(f));
    const tracked = new Set<string>();
    if (ctx.trackedFiles) {
      for (const f of ctx.trackedFiles) {
        const m = match(f);
        if (!m) continue;
        tracked.add(f);
        out.push({
          severity: m.severity,
          file: f,
          message: `${m.label} is tracked by git (${f}). Contents are not shown.`,
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
        message: 'No .gitignore found.',
        fix: 'Create .gitignore with at least: .env*, *.jks, *.keystore, *.p8, *.p12, google-services.json.',
      });
    } else if (!/^\/?\.env(\*|\.\*|\.local)?\s*$/m.test(ctx.gitignore)) {
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
