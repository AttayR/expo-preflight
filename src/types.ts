export type Severity = 'error' | 'warn' | 'info';

export interface RawFinding {
  message: string;
  fix: string;
  /** Overrides the rule's default severity for this finding. */
  severity?: Severity;
  /** Project-relative file the finding relates to. Never contains secret values. */
  file?: string;
}

export interface Finding extends RawFinding {
  ruleId: string;
  severity: Severity;
  docs: string;
}

export interface AppConfig {
  /** Relative path of the config file(s) used, e.g. "app.json". */
  file: string | null;
  /** The `expo` object (static JSON) or a best-effort extraction (dynamic configs). */
  expo: Record<string, unknown>;
  /** Raw text of all config files, used for key / env-var lookups. */
  text: string;
  /** True when app.config.js/ts (or similar) was found, so checks are partial. */
  dynamic: boolean;
  /** Field names (dotted) that were located in dynamic configs. Empty for static configs. */
  found: Set<string>;
  /** Names of plugin packages discovered. */
  plugins: string[];
  /** Android permissions discovered, normalised without the android.permission. prefix; null if not found. */
  androidPermissions: string[] | null;
}

export interface ProjectContext {
  root: string;
  packageJson: { dependencies: Record<string, string>; [k: string]: unknown } | null;
  /** All dependency names (dependencies + devDependencies). */
  deps: Set<string>;
  config: AppConfig;
  eas: { exists: boolean; json: Record<string, unknown> | null; error: string | null };
  gitignore: string | null;
  /** Files tracked by git relative to root; null when not a git repo / git unavailable. */
  trackedFiles: string[] | null;
  /** Secret-like files present on disk (relative paths). */
  diskFiles: string[];
  /** Variable names defined in .env.example / .env.sample / .env.template. */
  envExampleVars: Set<string>;
}

export interface Rule {
  id: string;
  title: string;
  defaultSeverity: 'error' | 'warn';
  check(ctx: ProjectContext): RawFinding[];
}

export interface PreflightConfig {
  /** Per-rule override: "off" | "warn" | "error". */
  rules?: Record<string, 'off' | 'warn' | 'error'>;
  failOn?: 'error' | 'warn';
}

export interface Report {
  root: string;
  findings: Finding[];
  counts: { error: number; warn: number; info: number };
  rulesRun: string[];
}
