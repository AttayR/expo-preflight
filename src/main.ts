import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadPreflightConfig } from './config.js';
import { format, type Format } from './report.js';
import { audit, shouldFail } from './run.js';

const HELP = `expo-preflight - audit an Expo project before eas build / eas update

Usage: expo-preflight [path] [options]

Options:
  --format <pretty|json|github>  Output format (default: pretty)
  --json                         Shortcut for --format json
  --fail-on <error|warn>         Exit non-zero on errors (default) or on warnings too
  --config <file>                Path to .preflightrc.json (default: <path>/.preflightrc.json)
  --no-color                     Disable colors
  -v, --version                  Print version
  -h, --help                     Show help

Exit codes: 0 ok, 1 findings at or above --fail-on, 2 usage / runtime error`;

declare const __VERSION__: string | undefined;

export function main(
  argv: string[],
  write: (s: string) => void = (s) => process.stdout.write(s + '\n'),
): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        format: { type: 'string' },
        json: { type: 'boolean' },
        'fail-on': { type: 'string' },
        config: { type: 'string' },
        'no-color': { type: 'boolean' },
        version: { type: 'boolean', short: 'v' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (e) {
    console.error(`expo-preflight: ${(e as Error).message}\n\n${HELP}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    write(HELP);
    return 0;
  }
  if (values.version) {
    write(typeof __VERSION__ === 'string' ? __VERSION__ : '0.1.0');
    return 0;
  }
  const fmt = (values.json ? 'json' : (values.format ?? 'pretty')) as Format;
  if (!['pretty', 'json', 'github'].includes(fmt)) {
    console.error(`expo-preflight: invalid --format "${String(values.format)}"`);
    return 2;
  }
  if (
    values['fail-on'] !== undefined &&
    values['fail-on'] !== 'error' &&
    values['fail-on'] !== 'warn'
  ) {
    console.error(`expo-preflight: invalid --fail-on "${values['fail-on']}" (use error or warn)`);
    return 2;
  }
  const root = resolve(positionals[0] ?? '.');
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`expo-preflight: not a directory: ${root}`);
    return 2;
  }
  try {
    const config = loadPreflightConfig(root, values.config);
    const failOn = (values['fail-on'] as 'error' | 'warn' | undefined) ?? config.failOn ?? 'error';
    const report = audit(root, config);
    const color =
      !values['no-color'] &&
      !process.env.NO_COLOR &&
      Boolean(process.stdout.isTTY || process.env.FORCE_COLOR);
    write(format(report, fmt, color));
    return shouldFail(report, failOn) ? 1 : 0;
  } catch (e) {
    console.error(`expo-preflight: ${(e as Error).message}`);
    return 2;
  }
}
