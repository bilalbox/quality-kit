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

- pre-commit: fast staged checks (Betterleaks `git --staged` + format)
- pre-push / CI: full gate
- **js-ts host:** husky + lint-staged; pin Node via `.nvmrc` / `engines`; `engine-strict=true`; `pnpm-workspace.yaml` `allowBuilds.esbuild: true` required for rev-dep's esbuild on pnpm 12
- **dart host:** lefthook; `./tools/quality/gate.sh`; Flutter via `subosito/flutter-action` (stable); Betterleaks + dependency_validator installed in `setup-flutter`
- **kotlin-android host:** lefthook; `./tools/quality/gate.sh` over Gradle `qualityFast` / `qualityFull` (from the copied-in `build-logic/quality` included build); JDK 21 + SDK licenses + `setup-gradle` + Robolectric jar cache + Betterleaks in `setup-android`; screenshot diffs uploaded as an artifact on failure
