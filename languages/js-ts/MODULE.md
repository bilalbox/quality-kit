# Pack: js-ts

Detect: `package.json` at target root. Templates: `languages/js-ts/templates/`.

## Tools

| Concern | Tool | Notes |
| --- | --- | --- |
| Format + lint | **Biome** | Defaults only (tabs, double quotes). One config across repos. |
| Types | **`tsc -b`** | Extends `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, …). |
| Secrets / leaks | **Betterleaks v1** | Pre-commit staged guard, `.betterleaks.toml`, `.betterleaksignore`. Pin 1.x until v2 is stable. |
| Graph / dead code / clones | **rev-dep** | Replaces knip, madge, dependency-cruiser, jscpd. Built-in baseline. |
| Cognitive complexity | **Biome overlay + custom ratchet** | Only remaining custom ratchet; shrink-only + `biome-ignore` ban. |

## Secrets (Betterleaks)

- **Install (host):** Betterleaks is a Go binary on PATH (not an npm dep). Prefer v1.9.0+.
  - macOS: `brew install --cask betterleaks/tap/betterleaks@1` → `betterleaks-v1`
  - Linux: release tarball from https://github.com/betterleaks/betterleaks/releases/tag/v1.9.0
  - CI: `setup-pnpm` composite action installs the pinned linux binary
- **Pre-commit**: `.husky/pre-commit` runs `pnpm lint:secrets -- --staged` before `lint-staged` (`betterleaks git --staged`).
- **Fast gate**: `pnpm gate:fast` → `pnpm lint:secrets` → `betterleaks dir .` (working tree + untracked).
- **CI**: `CI=true` → `betterleaks git --log-opts=origin/main..HEAD` (fallback: full `git` history). Offline detection only (no `--validation`).
- **Config**: `.betterleaks.toml` extends defaults (`useDefault = true`), allowlists test/fixture paths, and adds `retell-key-prefix` for bare `key_[a-f0-9]{28}` literals (built-in Retell rule still needs a nearby `retell` keyword).
- **Baselines**: `.betterleaksignore` holds fingerprints of acknowledged legacy leaks or fixtures.
- **v2 later:** CLI/config differ (stdin patch hooks, explicit `--config`, ignore-file model). Revisit when v2.0.0 is stable; keep this pack on 1.x until then.

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
3. Install Betterleaks v1 on the host (see Secrets above).
4. `pnpm install`.
5. Seed complexity: `pnpm lint:complexity -- --update`.
6. Seed rev-dep: `pnpm lint:graph -- --update-snapshot` (creates `.rev-dep.*.json`; do not hand-write).
7. Merge `AGENTS.quality.md` into `AGENTS.md`.
