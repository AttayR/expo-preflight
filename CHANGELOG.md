# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

### Added

- CLI `expo-preflight [path]` with `--format pretty|json|github`, `--json`, `--fail-on`, `--config`.
- Rules: `ios-usage-descriptions`, `android-permissions`, `runtime-version`, `eas-config`,
  `versioning`, `secrets-hygiene`.
- `.preflightrc.json` for rule toggles and severity overrides.
- Best-effort support for `app.config.js/ts` (partial checks plus an info note).
- Composite GitHub Action (`action.yml`) that posts/updates a PR comment.
