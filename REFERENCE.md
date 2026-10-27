# Quality kit reference

## Why each tool

| Concern | Tool | Notes |
| --- | --- | --- |
| Format + lint (JS/TS) | **Biome** | Defaults only (tabs, double quotes). One config across repos. |
| Types | **`tsc -b`** | Extends `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, …). |
| Graph / dead code / clones | **rev-dep** | Replaces knip, madge, dependency-cruiser, jscpd. Built-in baseline. |
| Cognitive complexity | **Biome overlay + custom ratchet** | Only remaining custom ratchet; shrink-only + `biome-ignore` ban. |
| Python lint/format | **ruff** via `uvx` | Biome analogue. |
| Python types | **basedpyright** (`standard`) | `tsc` analogue. |
| Python boundaries/cycles | **tach** | Always on when Python is present. |
| Python dead code | **vulture** + whitelist | Knip analogue. |

## Ratchet contract (complexity)

Shared by `scripts/ratchets/compare.ts`:

- **Novelty** — finding ID absent from baseline → fail
- **Stale prune** — baseline row no longer reproduces → fail
- **Score regression** — same ID, higher complexity score → fail
- **`--update`** — rewrite baseline; **refused when `CI=true`**
- **`biome-ignore` for `noExcessiveCognitiveComplexity`** → fail (extract helpers instead)

Finding ID: `file|functionName`, with `|line` when anonymous or ambiguous.

## rev-dep gotchas

- Prefer `rev-dep config run` (one pass) over individual CLI commands.
- `baselineSnapshotPath` must be set in config; **create the file only via** `pnpm lint:graph -- --update-snapshot`. Do not commit an empty `{}` placeholder — rev-dep rejects it.
- Duplicates use `.rev-dep.duplicates.json` (same update flag).
- Wrap updates through `scripts/run-rev-dep.ts` so CI refuses `--update-snapshot`.
- Tune `prodEntryPoints` / `devEntryPoints` per repo. False-positive unused modules: set `excludeModules`, `filesWithBinaries`, `pkgJsonFieldsWithBinaries`.
- `ignoreTypeImports: true` on cycles avoids type-only loops; runtime cycles still fail.

## Complexity thresholds

- **Legacy adopt:** `maxAllowedComplexity: 25` (template default); seed baseline, then shrink.
- **New repos:** set to **15**.
- Scan roots: edit `COMPLEXITY_ROOTS` in `run-complexity.ts` and matching `biome.complexity.json` `files.includes`.

## Python pins

Scripts use: `ruff@0.17.2`, `basedpyright@1.40.2`, `tach@0.35.3`, `vulture@2.16`.

- `tach.toml`: run `uvx tach@0.35.3 init` then refine `[[modules]]`. Keep `forbid_circular_dependencies = true`.
- Vulture: commit `vulture_whitelist.py` from `--make-whitelist`; treat like a baseline.

## TypeScript 7

madge + dependency-cruiser need patches under TS7 (`ts.sys` removed). **rev-dep avoids that.** Do not reintroduce madge/depcruise.

## apply / audit semantics

- **apply** copies missing files only; never overwrites. Merges missing `package.json` scripts/devDeps/`lint-staged`/`engines`.
- **audit** reports match / missing / drift vs templates (read-only).
- Template updates: audit shows drift; humans re-copy deliberately (no auto-overwrite).

## CI / hooks

- pre-commit: `lint-staged` (Biome on staged files)
- pre-push / CI: `pnpm gate` (+ `test:ratchets` in the quality-gate action)
- Node version from `.nvmrc` (24); `engine-strict=true`
- `pnpm-workspace.yaml` `allowBuilds.esbuild: true` required for rev-dep's esbuild on pnpm 12
