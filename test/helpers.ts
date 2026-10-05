import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadProject } from '../src/project.js';
import type { Rule } from '../src/types.js';

/** Create a temp project from a path -> content map. Objects are JSON-stringified. */
export function makeProject(files: Record<string, unknown>, opts: { git?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'preflight-'));
  for (const [name, content] of Object.entries(files)) {
    const p = join(dir, name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  if (opts.git) {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['add', '-A', '-f'], { cwd: dir });
  }
  return dir;
}

export const pkg = (deps: string[]) => ({
  name: 't',
  dependencies: Object.fromEntries(deps.map((d) => [d, '*'])),
});

export function runRule(rule: Rule, files: Record<string, unknown>, opts: { git?: boolean } = {}) {
  return rule
    .check(loadProject(makeProject(files, opts)))
    .map((f) => ({ ...f, severity: f.severity ?? rule.defaultSeverity }));
}
