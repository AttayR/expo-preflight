import { loadProject } from './project.js';
import { rules as allRules } from './rules/index.js';
import type { Finding, PreflightConfig, ProjectContext, Report, Severity } from './types.js';

export const DOCS_BASE = 'https://github.com/AttayR/expo-preflight#';

export function runRules(ctx: ProjectContext, config: PreflightConfig = {}): Report {
  const findings: Finding[] = [];
  const rulesRun: string[] = [];
  for (const rule of allRules) {
    const override = config.rules?.[rule.id];
    if (override === 'off') continue;
    rulesRun.push(rule.id);
    for (const f of rule.check(ctx)) {
      findings.push({
        ...f,
        ruleId: rule.id,
        severity: override ?? f.severity ?? rule.defaultSeverity,
        docs: `${DOCS_BASE}${rule.id}`,
      });
    }
  }
  if (ctx.config.dynamic) {
    findings.push({
      ruleId: 'dynamic-config',
      severity: 'info',
      message: `Dynamic config detected (${ctx.config.file}); values are extracted best-effort with regexes, so some checks are only partial.`,
      fix: 'Add a static app.json for the fields you want fully checked, or review dynamic values manually.',
      docs: `${DOCS_BASE}limitations`,
      file: ctx.config.file ?? undefined,
    });
  }
  const order: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return { root: ctx.root, findings, counts, rulesRun };
}

export function audit(root: string, config: PreflightConfig = {}): Report {
  return runRules(loadProject(root), config);
}

export function shouldFail(report: Report, failOn: 'error' | 'warn'): boolean {
  return report.counts.error > 0 || (failOn === 'warn' && report.counts.warn > 0);
}
