# Quality kit reference

Shared across language packs. Pack-specific tools and gotchas live in `languages/*/MODULE.md`.

## Ratchet contract

Shrink-only baseline comparison (js-ts complexity and Biome diagnostics use `scripts/ratchets/compare.ts`):

- **Novelty** — finding ID absent from baseline → fail
- **Stale prune** — baseline row no longer reproduces → fail
- **Score regression** — same ID, higher score → fail
- **`--update`** — rewrite baseline; **refused when `CI=true`**

Finding ID shape is pack-specific (see js-ts module for complexity and Biome diagnostic IDs). Baselines absorb legacy debt at adoption only; disabling a rule to get a pass is not a ratchet strategy. Dart pack v1 has no complexity ratchet yet.

## Desired state

Selected **Packs** (Host or Fragment — see `GLOSSARY.md`) each produce a **Contribution**. Those merge into one **Desired state** for the **Target**: root file placements, optional package-scoped placements (dart), and optional `package.json` expectations (js-ts Host, plus Fragment script/gate pieces).

- Every Host Pack also contributes the **Shared layer** (`languages/shared/`, see its MODULE.md): shared Placements resolve their template from `languages/shared/templates/` and are placed once however many Hosts are selected, labelled `[shared]` by apply and audit. Shared paths never collide.
- Overlapping target paths between different Packs are a **collision** unless both templates have identical content (after CRLF→LF normalization). Identical overlaps stay **first-wins** by Pack selection order (detect order, or `--packs` order); the file is placed once and labelled with the first Pack.
- Collisions land in `DesiredState.collisions` (`{ targetRel, packs }`, Packs in selection order) across root and package-scoped placements. **apply** and **audit** refuse a selection with any collision: they exit `2` before writing or diffing anything and list every colliding path with the Packs involved. Today every Host pair collides (js-ts + dart, js-ts + kotlin-android, dart + kotlin-android), including when detection picks two Hosts; pick one with `--packs`. Host + Fragment (js-ts + python) does not collide. This is an interim guard until multi-Host composition lands; later work relaxes it per path.
- Fragment without Host (e.g. `--packs python`): file placements still apply; `package.json` expectations only when the js-ts Host is selected. **audit** prints a warning when `python` is selected without `js-ts`.
- Kit code: `scripts/desired-state.ts` (`desiredState`, `diffAgainst`); Pack adapters in `scripts/packs/`.

## apply / audit semantics

- Both refuse colliding Pack selections (exit `2`, nothing written) — see Desired state above.
- **apply** builds Desired state, copies missing placement files only (never overwrites), sets executable bit when the placement asks for it, and merges missing `package.json` scripts/devDeps/`lint-staged`/`engines` from Desired state. Policy flags like `--force-scripts` stay in the apply adapter.
- **Next steps:** each Pack's Contribution carries `nextSteps`, read from the numbered list under `## Post-apply` in `languages/<pack>/MODULE.md` (one line per step). apply prints a "Next" block per selected Pack that declares steps, in Pack order, and nothing else. A Fragment prints its own block whether or not its Host is selected (audit already warns about orphan Fragments). Stub Packs (rust) declare none.
- **audit** builds the same Desired state, diffs the Target via `diffAgainst` (mode ignored), labels packs as host/fragment, warns on orphan Fragments, groups file findings by Placement kind, and exits non-zero on gaps.
- Template updates: audit shows drift on **owned** files only; humans re-copy deliberately (no auto-overwrite). Drift playbook (keep / merge / replace) lives in `SKILL.md`.
- Packs: detect from target, or `--packs a,b`. `--python` adds the `python` pack. Python detect ignores helper-script dirs (`tool`, `tools`, `scripts`, …).

### Placement kinds

Each Pack adapter declares a kind per template path (`scripts/packs/placements.ts` `placeFiles`; a test fails if any Placement lacks one). Per-pack lists live in each `languages/*/MODULE.md`.

| Kind | audit statuses (gap in bold) | apply |
| --- | --- | --- |
| owned | match, **drift**, **missing** | copy if missing |
| seed | present, **missing**, **invalid** | copy if missing |
| merge-into | merged, **unmerged** | copy the fragment if missing, unless its destination is already merged |

- **Seeds parse** only when they are JSON (`*.json`). YAML/TOML/Python seeds are checked for presence only: the kit has no parser dependencies.
- **Merge-into markers**: a destination counts as merged when, for every marker, some line (leading whitespace ignored) starts with it. A missing destination is unmerged. Markers are headings or keys, never values, so Targets can tune merged values (e.g. `qualityKit.minLineCoverage=80`). A test asserts each fragment contains its own markers.
- **The fragment file itself is not audited.** Delete it after merging; apply will not copy it back while the destination stays merged.
- **Self-merge**: when a Target usually has its own copy of a file (`pyproject.toml`, `Makefile`, `pnpm-workspace.yaml`, `.npmrc`), the destination is the placed path. apply still copies it into a Target that lacks it; otherwise the kit lines must be merged in by hand.

## CI / hooks

Principles:

- pre-commit: fast staged checks (Betterleaks `git --staged` + format). A hook never commits unstaged hunks: js-ts relies on lint-staged's stash; dart / kotlin-android check the staged blobs only and fail with the fix command (see their MODULE.md "Pre-commit format")
- pre-push / CI: full gate
- **every host:** secrets via the Shared layer's `tools/quality/run-secret-scan.sh`; CI installs Betterleaks with `./.github/actions/setup-betterleaks` (checksum-pinned) before the Host's own setup action
- **js-ts host:** husky + lint-staged; pin Node via `.nvmrc` / `engines`; `engine-strict=true`; `pnpm-workspace.yaml` `allowBuilds.esbuild: true` required for rev-dep's esbuild on pnpm 12
- **dart host:** lefthook; `./tools/quality/gate.sh`; Flutter via `subosito/flutter-action` pinned to an exact `flutter-version` (dart MODULE.md Pins); dependency_validator installed in `setup-flutter`
- **kotlin-android host:** lefthook; `./tools/quality/gate.sh` over Gradle `qualityFast` / `qualityFull` (from the copied-in `build-logic/quality` included build); JDK 21 + SDK licenses + `setup-gradle` + Robolectric jar cache in `setup-android`; screenshot diffs uploaded as an artifact on failure

## Kit CI

The kit's own `.github/workflows/ci.yml` runs on every PR (and on pushes to `main`) as one job, `kit`: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint:templates`. It installs Betterleaks with the Shared layer's `install-betterleaks.sh`, so `tests/secret-scan.test.ts` (skipped locally without Betterleaks, never under `CI`) runs the real scanner. All three steps run and report even when an earlier one fails. Branch protection on `main` must require the `kit` check for failures to block merge (a GitHub setting, not in the repo).

`pnpm lint:templates` (`scripts/lint-templates.ts`) exits 1 on any finding and 2 when a linter is missing:

- **shellcheck** at default severity (style and info included) with `-x -P SCRIPTDIR` on every `*.sh` under `languages/*/templates` (Packs and the Shared layer). Husky hooks (`.husky/*`, no shebang) are linted with `-s sh`.
- **actionlint** on the kit's own workflows, and on each Pack's template workflows inside a throwaway `git init` copy of the Shared layer's and that Pack's `.github`, so `uses: ./.github/actions/…` resolves to the composite actions a Target gets (input names checked). actionlint silently skips a local action it cannot find. actionlint also shellchecks workflow `run:` steps.
- Not covered: shell in composite action `run:` steps (neither tool lints it). Extract to a script under the Pack's templates to get coverage.
- Pins: shellcheck 0.11.0 and actionlint 1.7.12, downloaded in CI and checked against sha256 pinned in the workflow (ubuntu's preinstalled shellcheck is older). Bump version and hash together.
- Findings are fixed, not suppressed. If a suppression is unavoidable, use an inline `# shellcheck disable=SCxxxx # <reason>` on the line, never a file- or CLI-wide exclusion.
- Linter-backed tests in `tests/lint-templates.test.ts` skip locally when shellcheck/actionlint are not on PATH, but never when `CI` is set.
