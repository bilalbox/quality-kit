# Quality kit reference

Shared across language packs. Pack-specific tools and gotchas live in `languages/*/MODULE.md`.

## Ratchet contract

Shared compare CLI: `tools/quality/ratchets/compare.py` (language-neutral; js-ts tool runners call it via `tools/quality/ratchets/run-tool.ts`). Contract tests: `tools/quality/ratchets/ratchet-contract.test.sh`.

- **Novelty** — finding ID absent from baseline → fail
- **Stale prune** — baseline row no longer reproduces → fail
- **Score regression** — same ID, worse score → fail
  - `worseWhen: "higher"` (default; complexity / Biome) — current **>** baseline fails
  - `worseWhen: "lower"` (coverage) — current **<** baseline fails
- **Floor** (coverage) — `floor` on the baseline; score below it fails. Empty `findings` → floor only (greenfield / pre-adopt)
- **`--update`** — rewrite baseline; **refused when `CI=true`**

Finding ID shape is pack-specific (js-ts complexity / Biome IDs; coverage uses per-module path ids). Baselines absorb legacy debt at adoption only; disabling a rule to get a pass is not a ratchet strategy. Dart pack v1 has no complexity ratchet yet.

### Coverage ratchet

Every Host's **full** gate runs `tools/quality/run-coverage-ratchet.sh`, which calls Host `tools/quality/collect-coverage.sh` then the shared compare against seed `baselines/coverage.json`:

```json
{ "version": 1, "worseWhen": "lower", "floor": 80, "findings": [] }
```

| Decision | Choice |
| --- | --- |
| Greenfield floor default | **80** (`floor` in `baselines/coverage.json`; override per Target) |
| Per-module baseline format | Shared findings JSON; `id` = module/package path (`.` = repo root); `score` = line coverage % |
| js-ts collection | **c8** wraps `pnpm test`; aggregate by workspace package dir (or `.`) |
| dart collection | `flutter test --coverage` → `coverage/lcov.info` per package root |
| kotlin-android collection | Kover XML (`koverXmlReport`); replaces `qualityKit.minLineCoverage` verify |
| python Host (#17) | Same runner; add `tools/quality/collect-coverage.python.sh` emitting `{ "findings": [...] }` |

Raising coverage passes; lowering fails the gate. Tighten with `--update` locally (refused under `CI`). Legacy adopt: set `"floor": 0`, run the Host collector + `--update`, commit the baseline.

### Baseline growth (CI vs PR base)

`--update` / `--update-snapshot` are refused under `CI=true`, but a human can still commit a larger baseline. Every Host CI job (and each job in a composed multi-Host workflow) runs the Shared layer's `check-baseline-growth` action after checkout. It diffs HEAD against `origin/$GITHUB_BASE_REF` and **fails on added rows** (printed); removing rows passes. Ratchet JSON baselines also fail when an existing id's score moves the wrong way (**rise** for `worseWhen: higher`; **decrease** for coverage). Non-PR events skip. Deliberate growth: PR label **`allow-baseline-growth`** (workflow skips the step); local/repro: `--allow` or `ALLOW_BASELINE_GROWTH=1`.

Watched paths (absent on both sides → skip; new file on HEAD → all rows count as added):

| Path / glob | Row identity |
| --- | --- |
| `baselines/complexity.json`, `baselines/biome-diagnostics.json` | `findings[].id` (+ score rise) |
| `baselines/coverage.json` | `findings[].id` (+ score **decrease**) |
| `.rev-dep.baseline.json` | each finding under `workspaces.*.*` |
| `.rev-dep.duplicates.json` | each `duplications[]` entry |
| `**/detekt-baseline.xml` | each `<ID>` |
| `**/lint-baseline.xml` | each `<issue>` (`id`+file+line+column) |
| `.betterleaksignore`, `vulture_whitelist.py` | non-empty, non-`#` lines |
| `osv-scanner.toml` | each ignore `id = "…"` (Shared layer seed; watched when present) |

Script: `tools/quality/check-baseline-growth.sh`.

## Desired state

Selected **Packs** (Host or Fragment — see `GLOSSARY.md`) each produce a **Contribution**. Those merge into one **Desired state** for the **Target**: root file placements, optional package-scoped placements (dart), and optional `package.json` expectations (js-ts Host, plus Fragment script/gate pieces).

- Every Host Pack also contributes the **Shared layer** (`languages/shared/`, see its MODULE.md): shared Placements resolve their template from `languages/shared/templates/` and are placed once however many Hosts are selected, labelled `[shared]` by apply and audit. Shared paths never collide.
- Overlapping target paths between different Packs are a **collision** unless both templates have identical content (after CRLF→LF normalization). Identical overlaps stay **first-wins** by Pack selection order (detect order, or `--packs` order); the file is placed once and labelled with the first Pack.
- Collisions land in `DesiredState.collisions` (`{ targetRel, packs }`, Packs in selection order) across root and package-scoped placements. **apply** and **audit** refuse a selection with any collision: they exit `2` before writing or diffing anything and list every colliding path with the Packs involved. Host pairs still collide on non-CI paths (`.editorconfig`, `AGENTS.quality.md`, and for dart+kotlin also hooks/Makefile/gate scripts); CI no longer collides (see CI composition below). Host + Fragment (js-ts + python) does not collide. Remaining overlaps are cleared by multi-Host local-gate composition (#9).
- Fragment without Host (e.g. `--packs python`): file placements still apply; `package.json` expectations only when the js-ts Host is selected. **audit** prints a warning when `python` is selected without `js-ts`.
- Kit code: `scripts/desired-state.ts` (`desiredState`, `diffAgainst`); Pack adapters in `scripts/packs/`.

## apply / audit / upgrade semantics

- Both refuse colliding Pack selections (exit `2`, nothing written) — see Desired state above.
- **apply** builds Desired state, copies missing placement files only (never overwrites), sets executable bit when the placement asks for it, writes the Lock file (see below), and merges missing `package.json` scripts/devDeps/`lint-staged`/`engines` from Desired state. Policy flags like `--force-scripts` stay in the apply adapter.
- **Next steps:** each Pack's Contribution carries `nextSteps`, read from the numbered list under `## Post-apply` in `languages/<pack>/MODULE.md` (one line per step). apply prints a "Next" block per selected Pack that declares steps, in Pack order, and nothing else. A Fragment prints its own block whether or not its Host is selected (audit already warns about orphan Fragments). Stub Packs (rust) declare none.
- **audit** builds the same Desired state, diffs the Target via `diffAgainst` (mode ignored), labels packs as host/fragment, warns on orphan Fragments, groups file findings by Placement kind, runs each selected Pack's Wiring probes, and exits non-zero on gaps (file, `package.json` script, or wiring).
- Template updates: audit shows drift on **owned** files only, split by the Lock file into **stale** and **customized**. **upgrade** (below) replaces only the stale ones; customized and drift files are merged by hand. Drift playbook (keep / merge / replace) lives in `SKILL.md`.
- Packs: detect from target, or `--packs a,b`. `--python` adds the `python` pack. Python detect ignores helper-script dirs (`tool`, `tools`, `scripts`, …).

### Placement kinds

Each Pack adapter declares a kind per template path (`scripts/packs/placements.ts` `placeFiles`; a test fails if any Placement lacks one). Per-pack lists live in each `languages/*/MODULE.md`.

| Kind | audit statuses (gap in bold) | apply |
| --- | --- | --- |
| owned | current, **stale**, **customized**, **drift**, **missing** (see Lock file) | copy if missing; record hash |
| seed | present, **missing**, **invalid** | copy if missing |
| merge-into | merged, **unmerged** | copy the fragment if missing, unless its destination is already merged |

- **Generated Placements:** an owned Placement may carry a `content` string instead of reading a template file (today: the composed `.github/workflows/ci.yml`). apply writes that string; audit and the Lock file hash it the same way as template bytes. `templateRel` remains a label (the Host composition input path).
- **Seeds parse** only when they are JSON (`*.json`). YAML/TOML/Python seeds are checked for presence only: the kit has no parser dependencies.
- **Merge-into markers**: a destination counts as merged when, for every marker, some line (leading whitespace ignored) starts with it. A missing destination is unmerged. Markers are headings or keys, never values, so Targets can tune merged values (e.g. `qualityKit.minLineCoverage=80`). A test asserts each fragment contains its own markers.
- **The fragment file itself is not audited.** Delete it after merging; apply will not copy it back while the destination stays merged.
- **Self-merge**: when a Target usually has its own copy of a file (`pyproject.toml`, `Makefile`, `pnpm-workspace.yaml`, `.npmrc`), the destination is the placed path. apply still copies it into a Target that lacks it; otherwise the kit lines must be merged in by hand.
- audit prints a `fix:` line under each unmerged finding naming the kit template to merge and the destination.

### Wiring probes

Files can all be present while nothing runs the gate. Each Pack's Contribution carries `probes` (`WiringProbe`: a label plus `check(target)` returning gaps, each with an optional location and a fix). audit prints them under `## Wiring` as `wired` / `unwired`, with every gap's location and `fix:` line; any unwired probe exits `1`. Per-pack probe lists live in each Host's `MODULE.md`; Fragment and stub Packs contribute none.

- **Git hooks (every Host)**: asks git for the active hooks dir (`git rev-parse --git-path hooks`, so `core.hooksPath` and worktrees are honoured) and requires an executable `pre-commit` and `pre-push` there that belong to the Host's hook manager: lefthook hooks mention `lefthook`; husky's hooks dir is under `.husky/` (husky 9 sets `core.hooksPath=.husky/_`). A Target that is not a git repository is unwired.
- **AGENTS.md Definition of Done (every Host)**: not a separate probe. The `AGENTS.quality.md` → `AGENTS.md` merge-into finding already checks the `## Definition of Done (Mandatory Gate)` marker, so audit reports that gap once, under merge-into, with its fix.
- Probes read Target files as text and never run the Target's build tools (no Gradle, no pnpm), so audit stays fast and read-only. Gradle probes ignore `//` and `/* */` comments.

### Lock file

apply writes `.quality-kit.lock.json` at the Target root on every run. Commit it with the Target. Kit code: `scripts/lock-file.ts`.

```json
{
	"version": 1,
	"kitRevision": "04cd6938a51e8bfc338991257876d07f07f61fe8",
	"files": {
		"config/detekt/detekt.yml": "<sha256 hex>"
	}
}
```

- `version`: always `1`. Any other value, or a file that does not parse, counts as unreadable.
- `kitRevision`: `git rev-parse HEAD` of the kit checkout at the most recent apply or upgrade; `null` when the kit is not a git checkout. Informational: per-file hashes, not the revision, decide audit statuses.
- `files`: owned Placement `targetRel` (package-scoped paths included, e.g. `app/analysis_options.yaml`) → sha256 hex of the content the kit last wrote there, after CRLF→LF normalization. Keys sorted. Seed and merge-into Placements are never recorded.
- **Recording rule** (apply): for each owned Placement in this run's Desired state whose Target copy equals the current template, set its hash. Every other entry is kept as it was, including entries for Placements outside this run's selection. So a file apply copies is recorded; a file that already matched is recorded; a stale or customized file keeps its old hash; a file the Target brought itself (differing from the template at its first apply) is never recorded. An unreadable lock file is replaced.

audit judges each owned file in this order:

| Status | Meaning | Gap |
| --- | --- | --- |
| current | equals the template | no |
| stale | differs from the template, equals its recorded hash: untouched since apply, the kit moved on; safe to update | yes |
| customized | differs from both the template and its recorded hash: edited in the Target since apply | yes |
| drift | differs from the template, no recorded hash (no lock file, or a file the kit never wrote) | yes |

All three non-current states are gaps: an owned file must match the template, and the lock file only says why it does not. When the lock file is missing or unreadable, audit still runs and prints a `## Lock file` hint to re-run apply. Re-running apply on a pre-lock Target records only the files that currently match; the ones already differing stay `drift` until reconciled by hand (Drift playbook).

### upgrade

`pnpm run upgrade -- --target <repo> [--packs a,b] [--python] [--dry-run]` (kit code: `scripts/upgrade.ts`). Use `pnpm run`: bare `pnpm upgrade` is pnpm's builtin alias for `pnpm update` and never reaches the script (same reason as `pnpm run audit`).

- Builds the same Desired state as audit and refuses colliding selections (exit `2`).
- Refuses (exit `2`, nothing written) when the lock file is missing or unreadable: without recorded hashes nothing can be judged stale. Run apply first.
- Overwrites **stale** owned files only, with the current template (executable bit restored), then rewrites the lock file with the apply Recording rule, so the updated files are recorded and `kitRevision` moves to the kit's HEAD.
- Never modifies **customized** or **drift** owned files, seeds, merge-into destinations, or `package.json`. Customized and drift files are listed under `## Merge by hand` with a pointer to the Drift playbook.
- Never creates files: missing Placements are listed with a pointer to apply.
- `--dry-run` prints the same report with `would update` and writes nothing (files and lock file untouched).
- Exits `0` once it has run, even when files are left to merge by hand; audit stays the gate.

## CI / hooks

### CI composition

- Each Host Pack ships a **namespaced** quality-gate composite action at `.github/actions/<pack>-quality-gate/` (Host-specific steps stay in that action.yml). Setup actions stay Pack-specific (`setup-pnpm`, `setup-flutter`, `setup-android`).
- Each Host keeps a single-job workflow template at `languages/<pack>/templates/.github/workflows/ci.yml` with job id `ci`. That file is a **composition input**, not a Placement: Desired state always adds one generated owned Placement for `.github/workflows/ci.yml` via `scripts/packs/ci.ts` `composeCiWorkflow`.
- **One Host:** the generated workflow equals that Host's template (job name `ci`). **Several Hosts:** one workflow whose jobs are those Hosts' `ci` bodies renamed to the Pack id (selection order); each job keeps its own checkout / setup-betterleaks / setup / gate steps so Host-specific edits merge cleanly.
- The composed Placement is labelled with the first CI Host in selection order. Lock / audit / upgrade treat it like any other owned file (hash of generated content).
- Decision: multi-Host CI is **one workflow, one job per Host** (not one shared job), so concurrent Host CI edits stay isolated and failures are attributed per Pack.

Principles:

- pre-commit: fast staged checks (Betterleaks `git --staged` + format). A hook never commits unstaged hunks: js-ts relies on lint-staged's stash; dart / kotlin-android check the staged blobs only and fail with the fix command (see their MODULE.md "Pre-commit format")
- pre-push / CI: full gate
- **every host:** secrets via the Shared layer's `tools/quality/run-secret-scan.sh`; dependency vulns via `tools/quality/run-vuln-scan.sh` on the **full** gate only; CI checks out with `fetch-depth: 0`, runs `./.github/actions/check-baseline-growth` on pull requests (skip with label `allow-baseline-growth`; see Baseline growth above), and installs Betterleaks and osv-scanner with `./.github/actions/setup-betterleaks` and `./.github/actions/setup-osv-scanner` (checksum-pinned) before the Host's own setup action; the secret-scan wrapper scans `origin/$GITHUB_BASE_REF..HEAD` in CI. Ignore policy and offline/severity decisions: `languages/shared/MODULE.md`
- **js-ts host:** husky + lint-staged; pin Node via `.nvmrc` / `engines`; `engine-strict=true`; `pnpm-workspace.yaml` `allowBuilds.esbuild: true` required for rev-dep's esbuild on pnpm 12
- **dart host:** lefthook; `./tools/quality/gate.sh`; Flutter via `subosito/flutter-action` pinned to an exact `flutter-version` (dart MODULE.md Pins); dependency_validator installed in `setup-flutter`
- **kotlin-android host:** lefthook; `./tools/quality/gate.sh` over Gradle `qualityFast` / `qualityFull` (from the copied-in `build-logic/quality` included build); JDK 21 + SDK licenses + `setup-gradle` + Robolectric jar cache in `setup-android`; screenshot diffs uploaded as an artifact on failure

## Pins

`pins.json` at the kit root is the single source for every pinned tool version across Packs (and kit CI linters). Templates, MODULE.md Pins tables, and REFERENCE keep version literals so concurrent Pack work stays merge-friendly; `tests/pins.test.ts` fails when any scanned literal drifts from `pins.json` (`scripts/pins.ts` `pinDrift()`). Bump: edit `pins.json`, update every matching literal (the test lists the miss), commit together.

**js-ts `package.devDependencies.json`:** `@biomejs/biome` is an **exact** pin (a caret pulled 2.6.4 and broke the gate via schema mismatch / JSON reporter churn). Other Target devDependencies (`husky`, `lint-staged`, `rev-dep`, `tsx`, `typescript`) keep **caret** ranges; `pins.json` records the floor and the range policy. Checksums (Betterleaks per-arch, shellcheck, actionlint) live next to their versions in `pins.json` and in the install/CI scripts.

## Kit CI

The kit's own `.github/workflows/ci.yml` runs on every PR (and on pushes to `main`) as one job, `kit`: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint:templates`. It installs Betterleaks and osv-scanner with the Shared layer's install scripts, so `tests/secret-scan.test.ts` and `tests/vuln-scan.test.ts` (skipped locally without the binary / network, never under `CI`) run the real tools. All three steps run and report even when an earlier one fails. Branch protection on `main` must require the `kit` check for failures to block merge (a GitHub setting, not in the repo).

### Adoption smoke

One workflow per Host Pack (`smoke-js-ts`, `smoke-dart`, `smoke-kotlin-android`) proves scaffold → apply → Post-apply wiring → green `audit` (including wiring probes) → green `gate full`. Logic lives in `scripts/smoke.ts` / `scripts/smoke/`; CI jobs are thin wrappers (`pnpm smoke -- --pack <id>`). `pnpm test` stays fast: it only covers the smoke registry and orchestrator seams (`tests/smoke.test.ts`), never a real Pack smoke.

**Path filters (PR):** each smoke runs when that Pack's templates change, or when Shared-layer templates / smoke scripts / apply·audit·desired-state·packs / `package.json` / that workflow file change. Unrelated Pack PRs do not pay the smoke cost. **Schedule:** weekly Monday (staggered crons) to catch upstream Vite / Flutter / AGP breakage even when no Pack PR lands. **python:** Host Pack smoke lands with #17 — add `scripts/smoke/python.ts`, register it in `scripts/smoke/index.ts`, and add `.github/workflows/smoke-python.yml`. **kotlin scaffold:** Empty Activity–shaped Compose app at `compileSdk` 36 + Compose BOM 2026.06.01 (2026.09+ needs platform 37); bootstraps the Gradle wrapper via `QUALITY_KIT_GRADLE_BIN` or the cached 9.8.2 dist.

`pnpm lint:templates` (`scripts/lint-templates.ts`) exits 1 on any finding and 2 when a linter is missing:

- **shellcheck** at default severity (style and info included) with `-x -P SCRIPTDIR` on every `*.sh` under `languages/*/templates` (Packs and the Shared layer). Husky hooks (`.husky/*`, no shebang) are linted with `-s sh`.
- **actionlint** on the kit's own workflows, on each Pack's template workflows inside a throwaway `git init` copy of the Shared layer's and that Pack's `.github`, and on every multi-Host **composed** workflow (pairs and all three) with each selected Host's actions present, so `uses: ./.github/actions/…` resolves to the composite actions a Target gets (input names checked). actionlint silently skips a local action it cannot find. actionlint also shellchecks workflow `run:` steps.
- Not covered: shell in composite action `run:` steps (neither tool lints it). Extract to a script under the Pack's templates to get coverage.
- Pins: shellcheck 0.11.0 and actionlint 1.7.12 (see `pins.json`), downloaded in CI and checked against sha256 pinned in the workflow (ubuntu's preinstalled shellcheck is older). Bump version and hash in `pins.json` and the workflow together.
- Findings are fixed, not suppressed. If a suppression is unavoidable, use an inline `# shellcheck disable=SCxxxx # <reason>` on the line, never a file- or CLI-wide exclusion.
- Linter-backed tests in `tests/lint-templates.test.ts` skip locally when shellcheck/actionlint are not on PATH, but never when `CI` is set.
