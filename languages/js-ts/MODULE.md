# Pack: js-ts

Detect: `package.json` at target root. Templates: `languages/js-ts/templates/`.

## Tools

| Concern | Tool | Notes |
| --- | --- | --- |
| Format + lint | **Biome** | Defaults only (tabs, double quotes). One config across repos. |
| Types | **`tsc -b`** | Extends `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, …). |
| Graph / dead code / clones | **rev-dep** | Replaces knip, madge, dependency-cruiser, jscpd. Built-in baseline. |
| Cognitive complexity | **Biome overlay + custom ratchet** | Only remaining custom ratchet; shrink-only + `biome-ignore` ban. |

## Complexity

- Finding ID: `file|functionName`, with `|line` when anonymous or ambiguous.
- **`biome-ignore` for `noExcessiveCognitiveComplexity`** → fail (extract helpers instead).
- **Legacy adopt:** `maxAllowedComplexity: 25` (template default); seed baseline, then shrink.
- **New repos:** set to **15**.
- Scan roots: edit `COMPLEXITY_ROOTS` in `run-complexity.ts` and matching `biome.complexity.json` `files.includes`.

## rev-dep gotchas

- Prefer `rev-dep config run` (one pass) over individual CLI commands.
- `baselineSnapshotPath` must be set in config; **create the file only via** `pnpm lint:graph -- --update-snapshot`. Do not commit an empty `{}` placeholder — rev-dep rejects it.
- Duplicates use `.rev-dep.duplicates.json` (same update flag).
- Wrap updates through `scripts/run-rev-dep.ts` so CI refuses `--update-snapshot`.
- Tune `prodEntryPoints` / `devEntryPoints` per repo. False-positive unused modules: set `excludeModules`, `filesWithBinaries`, `pkgJsonFieldsWithBinaries`.
- `ignoreTypeImports: true` on cycles avoids type-only loops; runtime cycles still fail.

## TypeScript 7

madge + dependency-cruiser need patches under TS7 (`ts.sys` removed). **rev-dep avoids that.** Do not reintroduce madge/depcruise.

## Post-apply

1. Adjust `rev-dep.config.json` entry points / `moduleBoundaries`.
2. If `pnpm-workspace.yaml` already existed, merge `allowBuilds.esbuild`.
3. `pnpm install`.
4. Seed complexity: `pnpm lint:complexity -- --update`.
5. Seed rev-dep: `pnpm lint:graph -- --update-snapshot` (creates `.rev-dep.*.json`; do not hand-write).
6. Merge `AGENTS.quality.md` into `AGENTS.md`.
