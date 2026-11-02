# Quality kit reference

Shared across language packs. Pack-specific tools and gotchas live in `languages/*/MODULE.md`.

## Ratchet contract

Shrink-only baseline comparison (js-ts complexity uses `scripts/ratchets/compare.ts`):

- **Novelty** — finding ID absent from baseline → fail
- **Stale prune** — baseline row no longer reproduces → fail
- **Score regression** — same ID, higher score → fail
- **`--update`** — rewrite baseline; **refused when `CI=true`**

Finding ID shape is pack-specific (see js-ts module for complexity IDs). Dart pack v1 has no complexity ratchet yet.

## Desired state

Selected **Packs** (Host or Fragment — see `GLOSSARY.md`) each produce a **Contribution**. Those merge into one **Desired state** for the **Target**: root file placements, optional package-scoped placements (dart), and optional `package.json` expectations (js-ts Host, plus Fragment script/gate pieces).

- Overlapping target paths: **first-wins** by Pack selection order (detect order, or `--packs` order).
- Fragment without Host (e.g. `--packs python`): file placements still apply; `package.json` expectations only when the js-ts Host is selected. **audit** prints a warning when `python` is selected without `js-ts`.
- Kit code: `scripts/desired-state.ts` (`desiredState`, `diffAgainst`); Pack adapters in `scripts/packs/`.

## apply / audit semantics

- **apply** builds Desired state, copies missing placement files only (never overwrites), sets executable bit when the placement asks for it, and merges missing `package.json` scripts/devDeps/`lint-staged`/`engines` from Desired state. Policy flags like `--force-scripts` stay in the apply adapter.
- **Next steps:** each Pack's Contribution carries `nextSteps`, read from the numbered list under `## Post-apply` in `languages/<pack>/MODULE.md` (one line per step). apply prints a "Next" block per selected Pack that declares steps, in Pack order, and nothing else. A Fragment prints its own block whether or not its Host is selected (audit already warns about orphan Fragments). Stub Packs (rust) declare none.
- **audit** builds the same Desired state, diffs the Target via `diffAgainst` (content/presence; mode ignored), labels packs as host/fragment, warns on orphan Fragments, and exits non-zero on gaps.
- Template updates: audit shows drift; humans re-copy deliberately (no auto-overwrite). Drift playbook (keep / merge / replace) lives in `SKILL.md`.
- Packs: detect from target, or `--packs a,b`. `--python` adds the `python` pack. Python detect ignores helper-script dirs (`tool`, `tools`, `scripts`, …).

## CI / hooks

Principles:

- pre-commit: fast staged checks (Betterleaks `git --staged` + format)
- pre-push / CI: full gate
- **js-ts host:** husky + lint-staged; pin Node via `.nvmrc` / `engines`; `engine-strict=true`; `pnpm-workspace.yaml` `allowBuilds.esbuild: true` required for rev-dep's esbuild on pnpm 12
- **dart host:** lefthook; `./tools/quality/gate.sh`; Flutter via `subosito/flutter-action` (stable); Betterleaks + dependency_validator installed in `setup-flutter`
- **kotlin-android host:** lefthook; `./tools/quality/gate.sh` over Gradle `qualityFast` / `qualityFull` (from the copied-in `build-logic/quality` included build); JDK 21 + SDK licenses + `setup-gradle` + Robolectric jar cache + Betterleaks in `setup-android`; screenshot diffs uploaded as an artifact on failure

## Kit CI

The kit's own `.github/workflows/ci.yml` runs on every PR (and on pushes to `main`) as one job, `kit`: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint:templates`. All three steps run and report even when an earlier one fails. Branch protection on `main` must require the `kit` check for failures to block merge (a GitHub setting, not in the repo).

`pnpm lint:templates` (`scripts/lint-templates.ts`) exits 1 on any finding and 2 when a linter is missing:

- **shellcheck** at default severity (style and info included) with `-x -P SCRIPTDIR` on every `*.sh` under `languages/*/templates`. Husky hooks (`.husky/*`, no shebang) are linted with `-s sh`.
- **actionlint** on the kit's own workflows, and on each Pack's template workflows inside a throwaway `git init` copy of that Pack's `.github`, so `uses: ./.github/actions/…` resolves to the Pack's own composite actions (input names checked). actionlint also shellchecks workflow `run:` steps.
- Not covered: shell in composite action `run:` steps (neither tool lints it). Extract to a script under the Pack's templates to get coverage.
- Pins: shellcheck 0.11.0 and actionlint 1.7.12, downloaded in CI and checked against sha256 pinned in the workflow (ubuntu's preinstalled shellcheck is older). Bump version and hash together.
- Findings are fixed, not suppressed. If a suppression is unavoidable, use an inline `# shellcheck disable=SCxxxx # <reason>` on the line, never a file- or CLI-wide exclusion.
- Linter-backed tests in `tests/lint-templates.test.ts` skip locally when shellcheck/actionlint are not on PATH, but never when `CI` is set.
