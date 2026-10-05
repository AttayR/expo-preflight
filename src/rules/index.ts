import type { Rule } from '../types.js';
import { androidPermissions } from './android-permissions.js';
import { easConfig } from './eas-config.js';
import { iosUsageDescriptions } from './ios-usage-descriptions.js';
import { runtimeVersion } from './runtime-version.js';
import { secretsHygiene } from './secrets-hygiene.js';
import { versioning } from './versioning.js';

export const rules: Rule[] = [
  iosUsageDescriptions,
  androidPermissions,
  runtimeVersion,
  easConfig,
  versioning,
  secretsHygiene,
];

export {
  androidPermissions,
  easConfig,
  iosUsageDescriptions,
  runtimeVersion,
  secretsHygiene,
  versioning,
};
