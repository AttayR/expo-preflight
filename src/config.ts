import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { PreflightConfig } from './types.js';

export function loadPreflightConfig(root: string, explicit?: string): PreflightConfig {
  const path = explicit ? resolve(explicit) : join(root, '.preflightrc.json');
  if (!existsSync(path)) {
    if (explicit) throw new Error(`Config file not found: ${path}`);
    return {};
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`Invalid JSON in ${path}: ${(e as Error).message}`, { cause: e });
  }
  if (!raw || typeof raw !== 'object') throw new Error(`${path} must contain a JSON object`);
  const cfg = raw as Record<string, unknown>;
  const out: PreflightConfig = {};
  if (cfg.rules !== undefined) {
    if (!cfg.rules || typeof cfg.rules !== 'object') throw new Error('"rules" must be an object');
    out.rules = {};
    for (const [id, v] of Object.entries(cfg.rules as Record<string, unknown>)) {
      const val = v === false ? 'off' : v;
      if (val !== 'off' && val !== 'warn' && val !== 'error') {
        throw new Error(`rules.${id} must be "off", "warn" or "error"`);
      }
      out.rules[id] = val;
    }
  }
  if (cfg.failOn !== undefined) {
    if (cfg.failOn !== 'error' && cfg.failOn !== 'warn')
      throw new Error('"failOn" must be "error" or "warn"');
    out.failOn = cfg.failOn;
  }
  return out;
}
