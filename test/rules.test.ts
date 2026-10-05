import { describe, expect, it } from 'vitest';
import { androidPermissions } from '../src/rules/android-permissions.js';
import { easConfig, referencedEnvVars } from '../src/rules/eas-config.js';
import { iosUsageDescriptions } from '../src/rules/ios-usage-descriptions.js';
import { runtimeVersion } from '../src/rules/runtime-version.js';
import { secretsHygiene } from '../src/rules/secrets-hygiene.js';
import { versioning } from '../src/rules/versioning.js';
import { pkg, runRule } from './helpers.js';

const app = (expo: object) => ({ 'app.json': { expo } });

describe('ios-usage-descriptions', () => {
  it('flags missing keys for installed packages', () => {
    const f = runRule(iosUsageDescriptions, {
      'package.json': pkg(['expo-camera', 'react-native-ble-plx']),
      ...app({ ios: { infoPlist: { NSCameraUsageDescription: 'x' } } }),
    });
    const msgs = f.map((x) => x.message).join('\n');
    expect(msgs).toContain('NSMicrophoneUsageDescription');
    expect(msgs).toContain('NSBluetoothAlwaysUsageDescription');
    expect(msgs).not.toContain('NSCameraUsageDescription is not set');
    // No app sources to scan: BLE (no API map) stays an error, API-mapped keys are warnings.
    expect(f.find((x) => x.message.includes('Bluetooth'))?.severity).toBe('error');
    expect(f.find((x) => x.message.includes('Microphone'))?.severity).toBe('warn');
  });

  it('passes when keys exist', () => {
    const f = runRule(iosUsageDescriptions, {
      'package.json': pkg(['expo-contacts']),
      ...app({ ios: { infoPlist: { NSContactsUsageDescription: 'x' } } }),
    });
    expect(f).toEqual([]);
  });

  it('accepts plugin options and ignores uninstalled packages', () => {
    const f = runRule(iosUsageDescriptions, {
      'package.json': pkg(['expo-contacts']),
      ...app({ plugins: [['expo-contacts', { contactsPermission: 'Find friends' }]] }),
    });
    expect(f).toEqual([]);
    expect(runRule(iosUsageDescriptions, { 'package.json': pkg([]), ...app({}) })).toEqual([]);
  });

  it('warns (not errors) when plugin is registered with defaults only', () => {
    const f = runRule(iosUsageDescriptions, {
      'package.json': pkg(['expo-contacts']),
      ...app({ plugins: ['expo-contacts'] }),
    });
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe('warn');
  });
});

describe('android-permissions', () => {
  it('requires BLUETOOTH_SCAN/CONNECT for BLE', () => {
    const f = runRule(androidPermissions, {
      'package.json': pkg(['react-native-ble-plx']),
      ...app({ android: { permissions: ['BLUETOOTH_SCAN'] } }),
    });
    const msgs = f.map((x) => x.message).join('\n');
    expect(msgs).toContain('BLUETOOTH_CONNECT');
    expect(msgs).toContain('Android 12');
    expect(msgs).not.toContain('does not include BLUETOOTH_SCAN');
  });

  it('accepts either location permission and normalises android.permission prefix', () => {
    const f = runRule(androidPermissions, {
      'package.json': pkg(['expo-location']),
      ...app({ android: { permissions: ['android.permission.ACCESS_COARSE_LOCATION'] } }),
    });
    expect(f).toEqual([]);
  });

  it('flags dangerous and unused permissions', () => {
    const f = runRule(androidPermissions, {
      'package.json': pkg([]),
      ...app({ android: { permissions: ['READ_SMS', 'CAMERA'] } }),
    });
    expect(f.map((x) => x.message).join('\n')).toMatch(/READ_SMS[\s\S]*CAMERA/);
  });
});

describe('runtime-version', () => {
  it('errors when expo-updates has no runtimeVersion', () => {
    const f = runRule(runtimeVersion, {
      'package.json': pkg(['expo-updates']),
      ...app({ updates: { url: 'https://u.expo.dev/x' } }),
    });
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe('error');
  });

  it('warns when updates.url is missing', () => {
    const f = runRule(runtimeVersion, {
      'package.json': pkg(['expo-updates']),
      ...app({ runtimeVersion: '1.0.0' }),
    });
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe('warn');
  });

  it('flags policy conflicts', () => {
    const appVersion = runRule(runtimeVersion, {
      'package.json': pkg(['expo-updates']),
      ...app({ runtimeVersion: { policy: 'appVersion' }, updates: { url: 'u' } }),
    });
    expect(appVersion[0]?.message).toContain('expo.version');
    const native = runRule(runtimeVersion, {
      'package.json': pkg(['expo-updates']),
      ...app({ runtimeVersion: { policy: 'nativeVersion' }, updates: { url: 'u' } }),
    });
    expect(native).toHaveLength(2);
  });

  it('passes a valid config and ignores projects without expo-updates', () => {
    expect(
      runRule(runtimeVersion, {
        'package.json': pkg(['expo-updates']),
        ...app({
          version: '1.0.0',
          runtimeVersion: { policy: 'appVersion' },
          updates: { url: 'u' },
        }),
      }),
    ).toEqual([]);
    expect(runRule(runtimeVersion, { 'package.json': pkg([]), ...app({}) })).toEqual([]);
  });

  it('does not report missing fields for dynamic configs', () => {
    const f = runRule(runtimeVersion, {
      'package.json': pkg(['expo-updates']),
      'app.config.js': 'module.exports = ({config}) => ({ ...config })',
    });
    expect(f).toEqual([]);
  });
});

describe('eas-config', () => {
  it('errors when eas.json is missing or invalid', () => {
    expect(runRule(easConfig, { 'package.json': pkg([]), ...app({}) })[0]?.message).toContain(
      'not found',
    );
    const bad = runRule(easConfig, { 'package.json': pkg([]), ...app({}), 'eas.json': '{ nope' });
    expect(bad[0]?.message).toContain('could not be parsed');
  });

  it('validates profiles and submit', () => {
    const f = runRule(easConfig, {
      'package.json': pkg([]),
      ...app({}),
      'eas.json': {
        build: { a: { distribution: 'weird' }, b: { extends: 'zzz' } },
        submit: { production: { android: { track: 'gold' } } },
      },
    });
    const msgs = f.map((x) => x.message).join('\n');
    expect(msgs).toContain('distribution');
    expect(msgs).toContain('extends "zzz"');
    expect(msgs).toContain('track "gold"');
    expect(msgs).toContain('serviceAccountKeyPath');
  });

  it('flags undefined env vars but accepts eas env and .env.example', () => {
    const files = {
      'package.json': pkg([]),
      'app.config.js':
        'module.exports = { extra: { a: process.env.FOO_KEY, b: process.env.EXPO_PUBLIC_B, c: process.env.FROM_EX } }',
      'eas.json': { build: { production: { env: { FOO_KEY: '1' } } } },
      '.env.example': 'FROM_EX=\n',
    };
    const f = runRule(easConfig, files);
    const msgs = f.map((x) => x.message).filter((m) => m.includes('references'));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('EXPO_PUBLIC_B');
  });

  it('extracts referenced env vars', () => {
    expect(referencedEnvVars("process.env.A + process.env['B'] + process.env.NODE_ENV")).toEqual([
      'A',
      'B',
    ]);
  });
});

describe('versioning', () => {
  it('flags malformed values', () => {
    const f = runRule(versioning, {
      ...app({ version: 'abc', ios: { buildNumber: 5 }, android: { versionCode: '3' } }),
    });
    expect(f).toHaveLength(3);
    expect(f.every((x) => x.severity === 'error')).toBe(true);
  });

  it('errors on missing version', () => {
    expect(runRule(versioning, app({}))[0]?.message).toContain('expo.version is missing');
  });

  it('warns on missing buildNumber/versionCode only with local appVersionSource', () => {
    const base = { ...app({ version: '1.0.0' }) };
    const local = runRule(versioning, {
      ...base,
      'eas.json': { cli: { appVersionSource: 'local' } },
    });
    expect(local.filter((x) => x.severity === 'warn')).toHaveLength(2);
    const remote = runRule(versioning, {
      ...base,
      'eas.json': { cli: { appVersionSource: 'remote' } },
    });
    expect(remote).toEqual([]);
  });

  it('passes well-formed config', () => {
    const f = runRule(versioning, {
      ...app({ version: '2.1.0', ios: { buildNumber: '12' }, android: { versionCode: 12 } }),
      'eas.json': { cli: { appVersionSource: 'local' } },
    });
    expect(f).toEqual([]);
  });
});

describe('secrets-hygiene', () => {
  it('flags git-tracked secret files without printing contents', () => {
    const f = runRule(
      secretsHygiene,
      {
        '.env': 'TOKEN=super-secret-value',
        'google-services.json': '{"k":"super-secret-value"}',
        'android/app/release.keystore': 'bin',
        '.env.example': 'TOKEN=',
        '.gitignore': 'node_modules\n',
      },
      { git: true },
    );
    const text = JSON.stringify(f);
    expect(text).not.toContain('super-secret-value');
    const tracked = f.filter((x) => x.message.includes('tracked by git')).map((x) => x.file);
    expect(tracked).toEqual(
      expect.arrayContaining(['.env', 'google-services.json', 'android/app/release.keystore']),
    );
    expect(tracked).not.toContain('.env.example');
    expect(f.find((x) => x.file === '.env')?.severity).toBe('error');
    expect(f.some((x) => x.file === '.gitignore')).toBe(true);
  });

  it('is quiet for ignored secrets and a proper .gitignore', () => {
    const f = runRule(
      secretsHygiene,
      { '.env': 'A=1', '.gitignore': '.env\n.env.*\n!.env.example\n' },
      { git: true },
    );
    // git add -f tracks .env in this helper, so only assert on the non-tracked path
    expect(f.filter((x) => x.message.includes('not covered'))).toEqual([]);
  });

  it('warns on missing .gitignore', () => {
    const f = runRule(secretsHygiene, { 'package.json': pkg([]) });
    expect(f.some((x) => x.message.includes('No .gitignore'))).toBe(true);
  });

  it('flags untracked, un-ignored secret files on disk', () => {
    const f = runRule(secretsHygiene, { '.env': 'A=1', '.gitignore': 'node_modules\n' });
    expect(f.some((x) => x.file === '.env' && x.message.includes('not covered'))).toBe(true);
  });
});

describe('ios-usage-descriptions: per-API detection', () => {
  const sev = (f: { severity?: string }[]) => f.map((x) => x.severity);

  it('expo-sensors with only Accelerometer is info for NSMotionUsageDescription', () => {
    const f = runRule(iosUsageDescriptions, {
      'package.json': pkg(['expo-sensors']),
      'src/a.ts':
        "import { Accelerometer } from 'expo-sensors';\nAccelerometer.addListener(() => {});\n",
      ...app({}),
    });
    expect(sev(f)).toEqual(['info']);
    expect(f[0]?.message).toContain('only needed if you call Pedometer');
  });

  it('expo-sensors Pedometer without the motion string is an error', () => {
    const f = runRule(iosUsageDescriptions, {
      'package.json': pkg(['expo-sensors']),
      'src/a.ts': "import { Pedometer } from 'expo-sensors';\nPedometer.getStepCountAsync();\n",
      ...app({}),
    });
    expect(sev(f)).toEqual(['error']);
    expect(f[0]?.message).toContain('NSMotionUsageDescription');
  });

  it('Pedometer with the motion string or plugin option passes', () => {
    const src = {
      'src/a.ts': "import { Pedometer } from 'expo-sensors';\nPedometer.isAvailableAsync();\n",
    };
    expect(
      runRule(iosUsageDescriptions, {
        'package.json': pkg(['expo-sensors']),
        ...src,
        ...app({ ios: { infoPlist: { NSMotionUsageDescription: 'steps' } } }),
      }),
    ).toEqual([]);
    expect(
      runRule(iosUsageDescriptions, {
        'package.json': pkg(['expo-sensors']),
        ...src,
        ...app({ plugins: [['expo-sensors', { motionPermission: 'steps' }]] }),
      }),
    ).toEqual([]);
  });

  it('expo-image-picker library-only is info for the camera key', () => {
    const f = runRule(iosUsageDescriptions, {
      'package.json': pkg(['expo-image-picker']),
      'src/a.tsx':
        "import * as ImagePicker from 'expo-image-picker';\nImagePicker.launchImageLibraryAsync({});\n",
      ...app({ ios: { infoPlist: { NSPhotoLibraryUsageDescription: 'p' } } }),
    });
    expect(sev(f)).toEqual(['info']);
    expect(f[0]?.message).toContain('NSCameraUsageDescription');
    expect(f[0]?.message).toContain('launchCameraAsync');
  });

  it('expo-image-picker camera call without the camera string is an error', () => {
    const f = runRule(iosUsageDescriptions, {
      'package.json': pkg(['expo-image-picker']),
      'src/a.tsx':
        "import { launchCameraAsync } from 'expo-image-picker';\nlaunchCameraAsync({});\n",
      ...app({ ios: { infoPlist: { NSPhotoLibraryUsageDescription: 'p' } } }),
    });
    expect(f.filter((x) => x.severity === 'error')).toHaveLength(1);
    expect(f.find((x) => x.severity === 'error')?.message).toContain('NSCameraUsageDescription');
  });

  it('launchImageLibraryAsync without the photo library string is an error', () => {
    const f = runRule(iosUsageDescriptions, {
      'package.json': pkg(['expo-image-picker']),
      'src/a.tsx':
        "import * as ImagePicker from 'expo-image-picker';\nImagePicker.launchImageLibraryAsync({});\n",
      ...app({ ios: { infoPlist: { NSCameraUsageDescription: 'c' } } }),
    });
    expect(sev(f)).toEqual(['error']);
    expect(f[0]?.message).toContain('NSPhotoLibraryUsageDescription');
  });

  it('expo-camera: CameraView needs camera, recordAsync needs microphone', () => {
    const f = runRule(iosUsageDescriptions, {
      'package.json': pkg(['expo-camera']),
      'src/a.tsx': "import { CameraView } from 'expo-camera';\nconst x = <CameraView />;\n",
      ...app({}),
    });
    expect(f.find((x) => x.message.includes('NSCameraUsageDescription'))?.severity).toBe('error');
    expect(f.find((x) => x.message.includes('NSMicrophoneUsageDescription'))?.severity).toBe(
      'info',
    );
    const g = runRule(iosUsageDescriptions, {
      'package.json': pkg(['expo-camera']),
      'src/a.tsx':
        "import { CameraView } from 'expo-camera';\nref.recordAsync();\n<CameraView />;\n",
      ...app({ ios: { infoPlist: { NSCameraUsageDescription: 'c' } } }),
    });
    expect(sev(g)).toEqual(['error']);
    expect(g[0]?.message).toContain('NSMicrophoneUsageDescription');
  });

  it('expo-location: foreground vs background keys', () => {
    const fg = runRule(iosUsageDescriptions, {
      'package.json': pkg(['expo-location']),
      'src/a.ts':
        "import * as Location from 'expo-location';\nLocation.requestForegroundPermissionsAsync();\n",
      ...app({}),
    });
    expect(fg.map((x) => [x.severity, x.message.includes('WhenInUse')])).toEqual([['error', true]]);
    const bg = runRule(iosUsageDescriptions, {
      'package.json': pkg(['expo-location']),
      'src/a.ts':
        "import * as Location from 'expo-location';\nLocation.requestBackgroundPermissionsAsync();\n",
      ...app({ ios: { infoPlist: { NSLocationWhenInUseUsageDescription: 'w' } } }),
    });
    expect(sev(bg)).toEqual(['error']);
    expect(bg[0]?.message).toContain('NSLocationAlwaysAndWhenInUseUsageDescription');
  });

  it('unscannable sources (no JS/TS files) keep a warning for API-mapped keys', () => {
    const f = runRule(iosUsageDescriptions, {
      'package.json': pkg(['expo-sensors', 'expo-image-picker']),
      ...app({}),
    });
    expect(f.length).toBe(3);
    expect(sev(f).every((s) => s === 'warn')).toBe(true);
    expect(f[0]?.message).toContain('no app sources were found');
  });
});
