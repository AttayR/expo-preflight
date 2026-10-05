# expo-preflight

Catch the Expo build failures, store rejections and broken OTA updates **before** you run `eas build` or `eas update`.
Static, offline, no project code executed.

## 30-second start

```sh
cd my-expo-app
npx expo-preflight
```

The exit code is non-zero when problems are found, so it drops straight into CI. Requires Node 18+.

```sh
npx expo-preflight ./path/to/app      # audit another directory
npx expo-preflight --fail-on warn     # fail on warnings too
npx expo-preflight --json             # machine-readable
npx expo-preflight --format github    # Markdown for a PR comment
npx expo-preflight --config .preflightrc.json
```

A runnable example project lives in [`examples/expo-app`](examples/README.md).

## Sample output

Run against `test/fixtures/failing` in this repo (real CLI output, colors omitted):

```text
expo-preflight  test/fixtures/failing

error  expo-camera is installed but NSMicrophoneUsageDescription is not set; App Store submission will be rejected if the API is used.  ios-usage-descriptions
       file: app.json
       fix:  Set expo.ios.infoPlist.NSMicrophoneUsageDescription or the "microphonePermission" option of the expo-camera plugin in your app config.

error  expo-contacts is installed but NSContactsUsageDescription is not set; App Store submission will be rejected if the API is used.  ios-usage-descriptions
       file: app.json
       fix:  Set expo.ios.infoPlist.NSContactsUsageDescription or the "contactsPermission" option of the expo-contacts plugin in your app config.

error  expo-local-authentication is installed but NSFaceIDUsageDescription is not set; App Store submission will be rejected if the API is used.  ios-usage-descriptions
       file: app.json
       fix:  Set expo.ios.infoPlist.NSFaceIDUsageDescription or the "faceIDPermission" option of the expo-local-authentication plugin in your app config.

error  react-native-ble-plx is installed but NSBluetoothAlwaysUsageDescription is not set; App Store submission will be rejected if the API is used.  ios-usage-descriptions
       file: app.json
       fix:  Set expo.ios.infoPlist.NSBluetoothAlwaysUsageDescription or the "bluetoothAlwaysPermission" option of the react-native-ble-plx plugin in your app config.

error  runtimeVersion policy "nativeVersion" needs ios.buildNumber, which is missing.  runtime-version
       file: app.json
       fix:  Add expo.ios.buildNumber or switch policy to "fingerprint".

error  build.preview.distribution must be "store" or "internal".  eas-config
       file: eas.json
       fix:  Set distribution to "store" or "internal".

error  submit.production.android.track "gold" is not one of production, beta, alpha, internal.  eas-config
       file: eas.json
       fix:  Use a valid Play track.

error  expo.version "one.two" is not a valid version (expected e.g. 1.2.3).  versioning
       file: app.json
       fix:  Use a semver-style string such as "1.2.3".

error  android.versionCode "3" must be a positive integer (not a string).  versioning
       file: app.json
       fix:  Use a number, e.g. "versionCode": 3.

warn   expo-contacts is installed but android.permissions does not include READ_CONTACTS.  android-permissions
       file: app.json
       fix:  Add "READ_CONTACTS" to expo.android.permissions (some libraries add it via manifest merge; verify in your build).

warn   expo-local-authentication is installed but android.permissions does not include USE_BIOMETRIC or USE_FINGERPRINT.  android-permissions
       file: app.json
       fix:  Add "USE_BIOMETRIC" to expo.android.permissions (some libraries add it via manifest merge; verify in your build).

warn   react-native-ble-plx is installed but android.permissions does not include BLUETOOTH_CONNECT (required on Android 12+ / API 31+).  android-permissions
       file: app.json
       fix:  Add "BLUETOOTH_CONNECT" to expo.android.permissions (some libraries add it via manifest merge; verify in your build).

warn   react-native-ble-plx is installed but android.permissions does not include ACCESS_FINE_LOCATION.  android-permissions
       file: app.json
       fix:  Add "ACCESS_FINE_LOCATION" to expo.android.permissions (some libraries add it via manifest merge; verify in your build).

warn   android.permissions declares READ_SMS. SMS permissions are restricted by Google Play policy.  android-permissions
       file: app.json
       fix:  Remove READ_SMS unless you need it and have completed the Play Console declaration.

warn   android.permissions declares RECORD_AUDIO but no installed package in the known table uses it.  android-permissions
       file: app.json
       fix:  Remove RECORD_AUDIO if unused; unnecessary runtime permissions hurt Play review and user trust.

warn   expo-updates is installed but expo.updates.url is not set.  runtime-version
       file: app.json
       fix:  Run `eas update:configure` to set updates.url (and EAS project id).

warn   build.preview has no "channel" but expo-updates is installed; builds will not receive EAS Update.  eas-config
       file: eas.json
       fix:  Add "channel": "preview" to build.preview.

warn   build.production has no "channel" but expo-updates is installed; builds will not receive EAS Update.  eas-config
       file: eas.json
       fix:  Add "channel": "production" to build.production.

warn   submit.production.android has no serviceAccountKeyPath.  eas-config
       file: eas.json
       fix:  Set android.serviceAccountKeyPath to your Google service account JSON (keep it out of git).

warn   App config references EXPO_PUBLIC_SENTRY_DSN, which is not defined in any eas.json build env or .env.example.  eas-config
       file: app.json
       fix:  Add EXPO_PUBLIC_SENTRY_DSN to build.<profile>.env in eas.json (or EAS environment variables) and list it in .env.example.

warn   appVersionSource is "local" but ios.buildNumber is missing.  versioning
       file: app.json
       fix:  Add expo.ios.buildNumber (e.g. "1") and bump it each release.

warn   .env file exists (.env) and is not covered by .gitignore.  secrets-hygiene
       file: .env
       fix:  Add a .gitignore entry for .env before committing.

warn   google-services.json exists (google-services.json) and is not covered by .gitignore.  secrets-hygiene
       file: google-services.json
       fix:  Add a .gitignore entry for google-services.json before committing.

warn   Android keystore exists (release.keystore) and is not covered by .gitignore.  secrets-hygiene
       file: release.keystore
       fix:  Add a .gitignore entry for release.keystore before committing.

warn   .gitignore does not ignore .env files.  secrets-hygiene
       file: .gitignore
       fix:  Add ".env" and ".env.*" (and "!.env.example") to .gitignore.

FAIL  9 errors, 16 warnings, 0 info across 6 rules
```

Run against `test/fixtures/clean`:

```text
expo-preflight  test/fixtures/clean

No problems found.

PASS  0 errors, 0 warnings, 0 info across 6 rules
```

## Rules

| Rule                                                        | Default | Checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="ios-usage-descriptions"></a>`ios-usage-descriptions` | error   | Installed packages (expo-camera, expo-location, expo-image-picker, expo-media-library, expo-contacts, expo-av, expo-calendar, expo-local-authentication, react-native-ble-plx, ...) have their `NSxxxUsageDescription` in `ios.infoPlist` or the package's plugin options. Error only when the triggering API (e.g. `launchCameraAsync`, `Pedometer`, `launchImageLibraryAsync`) is found in app sources; installed-but-API-not-called is info; no scannable sources is a warning. Plugin-default-only is a warning; save-only `expo-media-library` needs `NSPhotoLibraryAddUsageDescription`; never-imported packages are info. |
| <a id="android-permissions"></a>`android-permissions`       | warn    | Packages vs `android.permissions` (incl. `BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT` for Android 12+); flags dangerous or unused permissions (SMS, call log, all-files, background location, ...). Registered config plugins suppress "missing" findings.                                                                                                                                                                                                                                                                                                                                                                               |
| <a id="runtime-version"></a>`runtime-version`               | error   | `expo-updates` installed but `runtimeVersion` missing; policy conflicts (`appVersion` without `version`, `nativeVersion` without `buildNumber`/`versionCode`); warns when `updates.url` is missing.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| <a id="eas-config"></a>`eas-config`                         | error   | `eas.json` exists and parses; profile fields (`distribution`, `extends`, `channel`); `submit` sanity; env vars referenced in app config but not defined in `eas.json` env or `.env.example` (info; skipped with `environment` or fallbacks); leaf profiles missing `channel`.                                                                                                                                                                                                                                                                                                                                                    |
| <a id="versioning"></a>`versioning`                         | error   | `version`, `ios.buildNumber`, `android.versionCode` well-formed; with `appVersionSource: local`, warns when build numbers are missing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| <a id="secrets-hygiene"></a>`secrets-hygiene`               | error   | `.env*`, `google-services.json`, `GoogleService-Info.plist`, keystores, `.p8`/`.p12`/`.mobileprovision` tracked by git (`git ls-files`) or present and not gitignored; missing `.gitignore` entries. Ancestor `.gitignore` files up to the git root are honoured; `debug.keystore` and `.env.*.example` are exempt. Paths only, never contents.                                                                                                                                                                                                                                                                                  |

Severities are `error` (fails by default), `warn`, and `info`.

## Configuration

`.preflightrc.json` in the project root (or `--config <file>`):

```json
{
  "failOn": "error",
  "rules": {
    "android-permissions": "off",
    "versioning": "warn"
  }
}
```

A rule value of `"off"` (or `false`) disables it; `"warn"` or `"error"` overrides the severity of every finding from that rule.

## GitHub Action

```yaml
name: Preflight
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  preflight:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: AttayR/expo-preflight@v0 # requires a published release tag
        with:
          fail-on: error
```

It runs `npx expo-preflight --format github`, writes the job summary, and creates or updates a single PR comment.
Inputs: `path`, `fail-on`, `config`, `version`, `comment`.

## Limitations

- API detection is a regex scan of JS/TS files (up to 3000, depth 6) that import the package. Calls made through wrappers in other files, dynamic property access or non-JS sources can be missed (reported as info) or, for broad names such as `Camera`, over-matched.
- Static only: reads `app.json`, `app.config.json`, `package.json`, `eas.json`, `.gitignore`, `.env.example`.
- `app.config.js/ts` is parsed with regexes (best effort); you get an info note and fields that cannot be found are not reported as missing.
- Usage-description and permission matching is by key or option name in the config text, not a full plugin evaluation.
- The package-to-key table covers common packages only (`src/data/packages.ts`); PRs welcome.
- Monorepos: `.gitignore` and `.env.example` are merged up to the git root (rooted `/patterns` are matched loosely); `git ls-files` only covers the app directory.
- Import and `expo-media-library` API detection is a regex scan of `.js/.ts(x)` sources, not a full analysis; `eas-config` cannot see variables defined in EAS server-side environments.
- Android permission findings are warnings because some libraries add permissions through manifest merging.

## Roadmap

- Fingerprint / runtimeVersion drift detection against the last published update
- Opt-in evaluation of dynamic configs via `expo config --json`
- Config-plugin aware checks and a larger package table
- SARIF output, Marketplace listing, `--fix` for trivial cases

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). MIT licensed, (c) Attay Rasool (AttayR).

> **Note on test fixtures:** the `.env`, `google-services.json` and `release.keystore` files under `test/fixtures/` are dummy files used only to test the `secrets-hygiene` rule. They contain no real credentials.
