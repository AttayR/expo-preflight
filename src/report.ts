import { relative } from 'node:path';
import pc from 'picocolors';
import type { Finding, Report } from './types.js';

export type Format = 'pretty' | 'json' | 'github';

function summary(r: Report): string {
  const s = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return `${s(r.counts.error, 'error')}, ${s(r.counts.warn, 'warning')}, ${r.counts.info} info across ${r.rulesRun.length} rules`;
}

export function formatPretty(r: Report, color = true): string {
  const c = color ? pc : pc.createColors(false);
  const tag = (f: Finding) =>
    f.severity === 'error'
      ? c.red('error')
      : f.severity === 'warn'
        ? c.yellow('warn ')
        : c.blue('info ');
  const lines: string[] = [
    c.bold(`expo-preflight  ${c.dim(relative(process.cwd(), r.root) || '.')}`),
    '',
  ];
  if (r.findings.length === 0) lines.push(c.green('No problems found.'), '');
  for (const f of r.findings) {
    lines.push(`${tag(f)}  ${f.message}  ${c.dim(f.ruleId)}`);
    if (f.file) lines.push(`       ${c.dim('file:')} ${f.file}`);
    lines.push(`       ${c.cyan('fix:')}  ${f.fix}`);
    lines.push('');
  }
  const line = summary(r);
  lines.push(
    r.counts.error > 0
      ? c.red(c.bold(`FAIL  ${line}`))
      : r.counts.warn > 0
        ? c.yellow(c.bold(`WARN  ${line}`))
        : c.green(c.bold(`PASS  ${line}`)),
  );
  return lines.join('\n');
}

export function formatJson(r: Report): string {
  return JSON.stringify(r, null, 2);
}

export const GITHUB_MARKER = '<!-- expo-preflight -->';

export function formatGithub(r: Report): string {
  const icon = (s: Finding['severity']) =>
    s === 'error' ? 'x' : s === 'warn' ? 'warning' : 'information_source';
  const out = [GITHUB_MARKER, '## expo-preflight report', ''];
  out.push(`**${summary(r)}**`, '');
  if (r.findings.length === 0) {
    out.push('No problems found.');
  } else {
    out.push('| | Rule | Problem | Fix |', '|---|---|---|---|');
    const esc = (t: string) => t.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    for (const f of r.findings) {
      const where = f.file ? ` (\`${f.file}\`)` : '';
      out.push(
        `| :${icon(f.severity)}: | [\`${f.ruleId}\`](${f.docs}) | ${esc(f.message)}${where} | ${esc(f.fix)} |`,
      );
    }
  }
  return out.join('\n');
}

export function format(r: Report, f: Format, color = true): string {
  return f === 'json' ? formatJson(r) : f === 'github' ? formatGithub(r) : formatPretty(r, color);
}
