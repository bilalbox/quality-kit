# Quality kit reference

Shared across language packs. Pack-specific tools and gotchas live in `languages/*/MODULE.md`.

## Ratchet contract

Shrink-only baseline comparison (js-ts complexity uses `scripts/ratchets/compare.ts`):

- **Novelty** — finding ID absent from baseline → fail
- **Stale prune** — baseline row no longer reproduces → fail
- **Score regression** — same ID, higher score → fail
- **`--update`** — rewrite baseline; **refused when `CI=true`**

Finding ID shape is pack-specific (see js-ts module for complexity IDs). Dart pack v1 has no complexity ratchet yet.

## apply / audit semantics

- **apply** copies missing files only; never overwrites. Merges missing `package.json` scripts/devDeps/`lint-staged`/`engines` when the `js-ts` pack is selected. For `dart`, also copies package-level files (`analysis_options.yaml`, `dart_dependency_validator.yaml`) into each resolved package root.
- **audit** reports match / missing / drift vs pack templates (read-only).
- Template updates: audit shows drift; humans re-copy deliberately (no auto-overwrite).
- Packs: detect from target, or `--packs a,b`. `--python` adds the `python` pack.

## CI / hooks

Principles:

- pre-commit: fast staged checks (Betterleaks `git --staged` + format)
- pre-push / CI: full gate
- **js-ts host:** husky + lint-staged; pin Node via `.nvmrc` / `engines`; `engine-strict=true`; `pnpm-workspace.yaml` `allowBuilds.esbuild: true` required for rev-dep's esbuild on pnpm 12
- **dart host:** lefthook; `./tools/quality/gate.sh`; Flutter via `subosito/flutter-action` (stable); Betterleaks + dependency_validator installed in `setup-flutter`
