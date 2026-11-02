# Pack: js-ts

Detect: `package.json` at target root. Templates: `languages/js-ts/templates/`.

## Tools

| Concern | Tool | Notes |
| --- | --- | --- |
| Format + lint | **Biome** | Defaults only (tabs, double quotes). One config across repos. Gate fails on any diagnostic; `pnpm fix` applies safe fixes (see Biome diagnostics). Also the type-aware linter (see Type-aware lint). |
| Types | **`tsc -b`** | Extends `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, …; see tsconfig strictness). |
| Secrets / leaks | **Betterleaks v1** | From the Shared layer: pre-commit staged guard, `gate:fast`, CI. Pin 1.x until v2 is stable. |
| Graph / dead code / clones | **rev-dep** | Replaces knip, madge, dependency-cruiser, jscpd. Built-in baseline. |
| Cognitive complexity | **Biome overlay + custom ratchet** | Only remaining custom ratchet; shrink-only + `biome-ignore` ban. |

## Secrets (Betterleaks)

Config, wrapper, install and CI step come from the Shared layer: see [languages/shared/MODULE.md](../shared/MODULE.md). Betterleaks is a Go binary on PATH, not an npm dep.

- **Wiring**: `pnpm lint:secrets` = `bash tools/quality/run-secret-scan.sh`. `.husky/pre-commit` runs `pnpm lint:secrets -- --staged` before `lint-staged`; `pnpm gate:fast` runs it over the working tree.
- **Pack allowlist** (`.betterleaks.d/js-ts.toml`): `baselines/`, `.rev-dep.*.json`, `.dev.vars*`, `.wrangler/`, plus the `retell-key-prefix` rule for bare `key_[a-f0-9]{28}` literals (built-in Retell rule still needs a nearby `retell` keyword). Test sources are scanned.
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

## Type-aware lint

Biome's own type-aware rules (`types` domain, nursery group at 2.6.3), enabled as errors in `biome.json`:

| Rule | Catches |
| --- | --- |
| `nursery/noFloatingPromises` | Promise neither awaited, returned, `.catch`-ed nor `void`-ed |
| `nursery/noMisusedPromises` | Promise where a void callback or a condition is expected (`forEach(async …)`, `if (promise)`) |
| `nursery/noUnsafeReturn` | `any` returned from a typed function (`return JSON.parse(raw)`) |
| `nursery/useExhaustiveSwitchCases` | `switch` over a union missing a member |

They run inside `pnpm lint`, so `gate:fast`, `pnpm fix`, lint-staged, editors and the Biome diagnostics ratchet all apply unchanged. Legacy findings baseline like any other rule (`src/a.ts|lint/nursery/noFloatingPromises`); see Legacy adoption above. Intentional fire-and-forget is `void promise` or `.catch(...)`, never `biome-ignore`. Their fixes are unsafe and not promoted (see Unsafe-fix policy), so `pnpm fix` never rewrites them: fix by hand.

### Decision record (2026-11, Biome 2.6.3, TypeScript 7.0.2 is npm `latest`)

Measured on a 14-defect sample and on sim-iq (823 TS files, ~249k lines; 16 cores, WSL2), with the same five rules (floating/misused promises, await-thenable, unsafe return, switch exhaustiveness) in each tool:

| | Biome type-aware (chosen) | oxlint `--type-aware` (oxlint 1.90 + oxlint-tsgolint 7.0) | typescript-eslint 8.72 type-checked |
| --- | --- | --- | --- |
| Rule coverage | 11/14 sample defects. Misses floating promises from some library `.d.ts` (`readFile` from `node:fs/promises`), unnecessary conditions and `any` assignment/argument (no rules yet) | 13/14 (also missed `readFile`); has `no-unnecessary-condition`, `no-unsafe-*` | 14/14; reference implementation |
| Speed on sim-iq | 0.29 s → 0.45 s for the whole Biome lint (same process) | 4–6 s extra | 55 s with an 8 GB heap; out of memory after 79 s at Node's default heap |
| Findings on sim-iq | 26, floating ones all real; one `useAwaitThenable` false positive | 542 (299 `await-thenable`, mostly noise from multi-tsconfig resolution) | 80 rule findings plus files outside every tsconfig reported as errors |
| TS7 | Own type inference; no TypeScript dependency | Built on typescript-go; compatible by design, still preview | Peer `typescript <6.1.0`: breaks under TS7 |
| Config burden | Four lines in the existing `biome.json`; existing ratchet; no overlap possible | Two native devDeps, `.oxlintrc.json` with every category off plus an allowlist, a second ratchet collector, tsconfig discovery per repo | ESLint + typescript-eslint, `projectService` config, disable every non-type-aware rule to avoid Biome overlap, heap tuning, a second ratchet collector |

Biome wins on speed, TS7 and burden, and it is the only option with zero overlap by construction: every lint finding comes from one tool and one ratchet. The cost is coverage. Known gaps: unnecessary conditions, `any` flowing in through assignments and arguments, and some library-typed promises.

**Excluded Biome rules:** `useAwaitThenable` (false positive on sim-iq when awaiting an optional generic callback typed `=> Promise<void>`), `useStrictBooleanExpressions` (style: rejects every `if (str)`), and the narrower `types` rules (`noUnsafePlusOperands`, `noBaseToString`, `noUnsafeUnaryMinus`, …), which sit outside the bug classes targeted here. Adding one later is a pack decision recorded here.

**Nursery caveat:** nursery rules can change between Biome minors; the exact pin means changes only arrive with a deliberate bump. When Biome promotes one of these rules, its config key moves out of `nursery` and its category changes (`lint/nursery/X` → `lint/<group>/X`). In the bump commit, move the key in `biome.json`, run `pnpm lint -- --update` to rename the baseline rows, and check that the scores did not change.

**Revisit** when oxlint's type-aware mode leaves preview: add it only for rules Biome lacks (`no-unnecessary-condition`, `no-unsafe-assignment`, `no-unsafe-argument`, …), never for a rule Biome already reports, and feed it through the shared ratchet contract.

**Overlap with tsc:** tsc is the compiler, not a second linter, but two edges coincide. tsc's TS2801 ("condition will always return true", for a promise used directly in an `if`) overlaps `noMisusedPromises` in that one case. A non-void function whose switch lacks a case and has no trailing return gets TS2366 from tsc as well as `useExhaustiveSwitchCases`. Floating promises, promises passed as void callbacks and `any` returns are reported by Biome alone.

## tsconfig strictness

`tsconfig.base.json` is owned and shared by greenfield and legacy Targets, and tsc errors cannot be baselined. So base flags must be cheap to adopt, and anything that is greenfield-only goes in the Target's own `tsconfig.json`.

| Flag | Decision | Why |
| --- | --- | --- |
| `noImplicitOverride` | **On in base** | Catches a method that silently stops overriding after a base-class rename. No Biome equivalent. Legacy fix is mechanical (add `override`). |
| `exactOptionalPropertyTypes` | **Greenfield only** (Target `tsconfig.json`, see SKILL.md New) | Catches `{ name: undefined }` passed where `name` may only be absent. In legacy code it fails on every `prop: maybeUndefined`, library props included, and tsc has no baseline. |
| `noPropertyAccessFromIndexSignature` | Rejected | Contradicts Biome's `useLiteralKeys`: Biome asks for `env.HOME`, tsc then demands `env["HOME"]` (verified at 2.6.3). One of the two would have to be silenced. |
| `noUnusedLocals`, `noUnusedParameters` | Rejected | Duplicate Biome's `noUnusedVariables` / `noUnusedFunctionParameters`, which are baselinable. |

All of these flags behave the same in TypeScript 7.

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

madge + dependency-cruiser need patches under TS7 (`ts.sys` removed). **rev-dep avoids that.** Do not reintroduce madge/depcruise. Same rule for typescript-eslint (peer `typescript <6.1.0` at 8.72); type-aware lint stays in Biome (see Type-aware lint).

## Placement kinds

Everything not listed is **owned** (audit reports drift). Shared-layer files: see [languages/shared/MODULE.md](../shared/MODULE.md).

- **seed:** `biome.complexity.json`, `rev-dep.config.json`, `baselines/complexity.json`, `baselines/biome-diagnostics.json`, `.gitignore`
- **merge-into:** `AGENTS.quality.md` → `AGENTS.md` (`## Definition of Done (Mandatory Gate)`); `pnpm-workspace.yaml` → itself (`esbuild: true`); `.npmrc` → itself (`engine-strict=true`)

## Wiring probes

audit checks (see REFERENCE.md "Wiring probes"):

- **git hooks installed (husky)**: `core.hooksPath` points under `.husky/` with executable `pre-commit` and `pre-push` (set by `pnpm install` through the `prepare: husky` script).
- **package.json has a test script**: `gate` ends with `pnpm test`. Any non-empty `test` script passes; the kit does not judge its content.

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
