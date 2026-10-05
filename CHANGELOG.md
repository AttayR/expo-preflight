# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.1] - Unreleased

Precision release driven by a scan of 23 open-source Expo apps. CLI flags, exit codes and the JSON
report shape are unchanged; some findings are now `info` instead of `warn`/`error`.

### Changed

- Monorepos: `.gitignore` and `.env.example` / `.env.*.example` files are merged from the app
  directory up to the git root.
- `eas-config`: env-var references are skipped when any build profile sets `environment`, when
  every use has a fallback (`??`, `||`) or is compared with a literal; remaining ones are `info`.
- `eas-config`: only leaf profiles are checked for `channel` (a profile others `extends` is a
  shared base; channels are inherited through `extends`).
- `secrets-hygiene`: `debug.keystore` and `.env.*.example|sample|template` are exempt;
  `credentials.json` is `info` unless it has key/password-like fields (contents are never printed);
  `.env*.local` and glob patterns in `.gitignore` are understood; the ".gitignore does not ignore
  .env" warning only fires when a real `.env` file is tracked.
- `android-permissions`: "covers" are separated from "requires" (e.g. `expo-calendar` covers
  `WRITE_CALENDAR`, `expo-media-library` covers storage permissions); "missing permission" is
  suppressed when the package's config plugin is registered.
- `eas-config` / `versioning`: "eas.json not found" and "expo.version is missing" are `info` in
  example/demo/sample folders; `expo.version` falls back to `package.json` version.
- `ios-usage-descriptions`: `microphonePermission` from any camera/audio plugin is accepted;
  `expo-media-library` used only to save requires `NSPhotoLibraryAddUsageDescription`; packages
  never imported in app sources are reported as `info`.

## [0.1.0] - Unreleased

### Added

- CLI `expo-preflight [path]` with `--format pretty|json|github`, `--json`, `--fail-on`, `--config`.
- Rules: `ios-usage-descriptions`, `android-permissions`, `runtime-version`, `eas-config`,
  `versioning`, `secrets-hygiene`.
- `.preflightrc.json` for rule toggles and severity overrides.
- Best-effort support for `app.config.js/ts` (partial checks plus an info note).
- Composite GitHub Action (`action.yml`) that posts/updates a PR comment.
