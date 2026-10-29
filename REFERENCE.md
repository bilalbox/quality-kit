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
- **audit** builds the same Desired state, diffs the Target via `diffAgainst` (content/presence; mode ignored), labels packs as host/fragment, warns on orphan Fragments, and exits non-zero on gaps.
- Template updates: audit shows drift; humans re-copy deliberately (no auto-overwrite). Drift playbook (keep / merge / replace) lives in `SKILL.md`.
- Packs: detect from target, or `--packs a,b`. `--python` adds the `python` pack. Python detect ignores helper-script dirs (`tool`, `tools`, `scripts`, …).

## CI / hooks

Principles:

- pre-commit: fast staged checks (Betterleaks `git --staged` + format)
- pre-push / CI: full gate
- **js-ts host:** husky + lint-staged; pin Node via `.nvmrc` / `engines`; `engine-strict=true`; `pnpm-workspace.yaml` `allowBuilds.esbuild: true` required for rev-dep's esbuild on pnpm 12
- **dart host:** lefthook; `./tools/quality/gate.sh`; Flutter via `subosito/flutter-action` (stable); Betterleaks + dependency_validator installed in `setup-flutter`
