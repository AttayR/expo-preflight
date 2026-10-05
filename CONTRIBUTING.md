# Contributing

Thanks for helping! Setup:

```sh
npm ci
npm run lint && npm run typecheck && npm run build && npm test
```

## Adding a rule

1. Create `src/rules/<rule-id>.ts` exporting a `Rule` (`id`, `title`, `defaultSeverity`, `check(ctx)`).
   Each finding needs a `message` and a `fix` hint. The docs anchor is generated from the id.
2. Register it in `src/rules/index.ts`.
3. Add a row to the README rules table.
4. Add tests in `test/rules.test.ts` (use `runRule` from `test/helpers.ts` to build temp projects).
5. Rules are static-only: read files, never execute project code, never print secret values.

Package-to-permission data lives in `src/data/packages.ts`; PRs adding packages are welcome.

## Versioning

Semantic versioning. Update `CHANGELOG.md` in the same PR. Releases are cut by maintainers.

## Commits

Conventional style (`feat:`, `fix:`, `docs:`, `chore:`) is preferred.
