# Pack: js-ts

Detect: `package.json` at target root. Templates: `languages/js-ts/templates/`.

## Tools

| Concern | Tool | Notes |
| --- | --- | --- |
| Format + lint | **Biome** | Defaults only (tabs, double quotes). One config across repos. Gate fails on any diagnostic; `pnpm fix` applies safe fixes (see Biome diagnostics). |
| Types | **`tsc -b`** | Extends `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, …). |
| Secrets / leaks | **Betterleaks v1** | From the Shared layer: pre-commit staged guard, `gate:fast`, CI. Pin 1.x until v2 is stable. |
| Graph / dead code / clones | **rev-dep** | Replaces knip, madge, dependency-cruiser, jscpd. Built-in baseline. |
| Cognitive complexity | **Biome overlay + custom ratchet** | Only remaining custom ratchet; shrink-only + `biome-ignore` ban. |

## Secrets (Betterleaks)

Config, wrapper, install and CI step come from the Shared layer: see [languages/shared/MODULE.md](../shared/MODULE.md). Betterleaks is a Go binary on PATH, not an npm dep.

- **Wiring**: `pnpm lint:secrets` = `bash tools/quality/run-secret-scan.sh`. `.husky/pre-commit` runs `pnpm lint:secrets -- --staged` before `lint-staged`; `pnpm gate:fast` runs it over the working tree.
- **Pack allowlist** (`.betterleaks.d/js-ts.toml`): `*.test.(ts|js|py)`, `baselines/`, `.rev-dep.*.json`, `.dev.vars*`, `.wrangler/`, plus the `retell-key-prefix` rule for bare `key_[a-f0-9]{28}` literals (built-in Retell rule still needs a nearby `retell` keyword).
- **v2 later:** CLI/config differ (stdin patch hooks, explicit `--config`, ignore-file model). Revisit when v2.0.0 is stable; keep this pack on 1.x until then.

## Biome diagnostics

- **Gate:** `pnpm lint` runs `scripts/ratchets/run-biome.ts` (`biome check --reporter=json .`). Any **error, warning or info** diagnostic fails unless baselined. Info counts too: a passing gate means zero outstanding Biome diagnostics. Biome's own `--error-on-warnings` would let info through and cannot baseline, hence the wrapper.
- **Fix:** `pnpm fix` = `biome check --write .`, safe fixes repo-wide. Failure output names it. It exits non-zero while error-level diagnostics remain; the gate is the judge.
- **Baseline:** `baselines/biome-diagnostics.json`, shared ratchet contract (REFERENCE.md). Finding ID `file|rule` (e.g. `src/a.ts|lint/suspicious/noExplicitAny`), score = occurrences of that rule in that file. No line numbers, so unrelated edits don't churn IDs; more occurrences = score regression. Greenfield keeps it empty. The file must not be named `biome.json`: Biome loads any nested `biome.json` as config.
- **Never baselinable:** format, assist (organize imports) and parse diagnostics. They fail outright and block `--update`; `pnpm fix` clears the fixable ones.
- **Pre-commit:** lint-staged keeps `biome check --write` on staged files (safe fixes; exits 0 on warnings). The gate is the enforcement.
- **Pin:** `@biomejs/biome` is pinned **exactly** (`2.6.3`, matching `$schema` in `biome.json` / `biome.complexity.json`). A caret range installed 2.6.4, whose schema-mismatch diagnostic then fails the gate; the JSON reporter is also unstable across patches. Bump the dependency and both `$schema` URLs together.
- **Generated files:** `pnpm-lock.yaml` is excluded in `biome.json` (Biome 2.6 formats YAML and would rewrite it).

### Unsafe-fix policy

Neither the `fix` script nor hooks ever pass `--unsafe`. Unsafe fixes that are mechanical and high-volume in legacy code are promoted to safe per rule in `biome.json` (`"fix": "safe"`), so `pnpm fix`, lint-staged and editors apply them:

| Rule | Why auto-apply is acceptable |
| --- | --- |
| `correctness/noUnusedImports` | Removes unused import specifiers. Only risk: dropping a module's load-time side effect when every specifier is unused; typecheck + tests catch it. |
| `style/useTemplate` | Concatenation → template literal. Only differs for objects whose `valueOf` and `toString` disagree. |

Everything else with an unsafe fix needs human review, e.g. `noUnusedVariables` (its fix prefixes `_`, i.e. silences), `noDoubleEquals`, `useOptionalChain` (changes falsy results), `useNodejsImportProtocol` (breaks browser polyfills like `events`/`buffer`). Apply one rule at a time on named paths and review the diff:

```bash
pnpm exec biome check --write --unsafe --only=lint/suspicious/noDoubleEquals src/legacy
```

Promoting another rule is a pack decision recorded here, not a per-repo tweak.

### Legacy adoption

1. `pnpm fix`, then commit that alone (one-off repo-wide safe-fix commit).
2. `pnpm lint -- --update` baselines what needs manual work (refused under `CI=true` and while format/assist/parse diagnostics remain). Commit the baseline.
3. Shrink: fixed rows fail as stale until pruned with `pnpm lint -- --update`; new or extra occurrences fail.

Do not turn rules off or down in `biome.json` to adopt; no blanket rule-disable.

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

## Placement kinds

Everything not listed is **owned** (audit reports drift). Shared-layer files: see [languages/shared/MODULE.md](../shared/MODULE.md).

- **seed:** `biome.complexity.json`, `rev-dep.config.json`, `baselines/complexity.json`, `baselines/biome-diagnostics.json`, `.gitignore`
- **merge-into:** `AGENTS.quality.md` → `AGENTS.md` (`## Definition of Done (Mandatory Gate)`); `pnpm-workspace.yaml` → itself (`esbuild: true`); `.npmrc` → itself (`engine-strict=true`)

## Post-apply

`apply` prints this list as its "Next" output, so it is the only copy of these steps. Keep each step on one line.

1. Adjust `rev-dep.config.json` entry points / `moduleBoundaries`.
2. If `pnpm-workspace.yaml` already existed, merge `allowBuilds.esbuild`.
3. Install Betterleaks v1 on the host (see languages/shared/MODULE.md).
4. `pnpm install`.
5. Seed complexity: `pnpm lint:complexity -- --update`.
6. Seed rev-dep: `pnpm lint:graph -- --update-snapshot` (creates `.rev-dep.*.json`; do not hand-write).
7. Merge `AGENTS.quality.md` into `AGENTS.md`.
8. Biome cleanup: `pnpm fix` as a one-off commit, then baseline the rest with `pnpm lint -- --update` (see Biome diagnostics → Legacy adoption).
