---
name: quality-gates
description: Copy-in quality gates by language pack. Invoke to audit or adopt.
disable-model-invocation: true
---

# Quality gates

Language packs live under `languages/`. Workflows: **audit**, **adopt**, **new**.

Always run kit CLIs from **`~/mycode/quality-kit`** (this skill is a symlink to that repo, installed for both Cursor at `~/.agents/skills/quality-gates` and Claude Code at `~/.claude/skills/quality-gates` — keep both links when changing the install).

## Bare invoke

When the user says `/quality-gates` with no workflow:

1. Run **audit** (read-only) against the current workspace Target.
2. Summarize Host vs Fragment packs, gaps, and warnings.
3. Ask whether to **adopt** (and which packs) before mutating the Target.

Do not apply or edit the Target until the user confirms adopt (or an explicit pack set).

## Quick start

```bash
# From ~/mycode/quality-kit:
pnpm run audit -- --target ~/mycode/<repo>
pnpm apply -- --target ~/mycode/<repo>
pnpm apply -- --target ~/mycode/<repo> --packs js-ts,python
pnpm apply -- --target ~/mycode/<repo> --packs dart
pnpm apply -- --target ~/mycode/<repo> --packs kotlin-android
pnpm apply -- --target ~/mycode/<repo> --python   # force-add python Fragment
```

### Pack selection

- **Detect** when `--packs` omitted: Host/Fragment signals in the Target.
- **Override** with `--packs a,b` (recommended when detect is noisy).
- `--python` force-adds the python Fragment.

| Pack | Kind | Detect |
| --- | --- | --- |
| `js-ts` | Host | Root `package.json` with real deps (Flutter stub JSON ignored) |
| `dart` | Host | `pubspec.yaml` within depth 3 |
| `kotlin-android` | Host | Root `settings.gradle(.kts)` + AGP referenced in root build / settings / `gradle/libs.versions.toml` (Flutter `android/` ignored) |
| `python` | Fragment → **js-ts** Host | Root `pyproject.toml`, or `.py` outside helper dirs (`tool`, `tools`, `scripts`, `script`, `bin`) |
| `rust` | (stub) | `Cargo.toml` — detect only; no templates yet |

**Flutter / Dart with helper scripts:** prefer `--packs dart`. Incidental `tool/*.py` must not pull in python; force with `--python` only for a real Python product surface.

**Fragment without Host:** audit warns. File templates can still apply, but python gate scripts only wire into a js-ts Host `package.json`. Do not treat orphan Fragment gaps as Host debt unless the user wants that pack.

## Hosts vs after-apply

- **js-ts Host:** tune entry points → `pnpm install` → seed baselines → merge `AGENTS.quality.md` into `AGENTS.md` → `pnpm gate`.
- **dart Host:** set `quality-kit.dart.json` roots → install Betterleaks + lefthook → `lefthook install` → merge `AGENTS.quality.md` → `./tools/quality/gate.sh full`.
- **kotlin-android Host:** wire `includeBuild("build-logic/quality")` + `quality-kit.root` + `quality-kit.android` per module → merge `gradle.quality.properties` and `AGENTS.quality.md` → `./tools/quality/doctor.sh` → `lefthook install` → `run-format.sh --fix` → `screenshots.sh record` → `./tools/quality/gate.sh full`.

## Packs

Before pack-specific steps, **read** each selected pack's module:

- [languages/js-ts/MODULE.md](languages/js-ts/MODULE.md)
- [languages/python/MODULE.md](languages/python/MODULE.md)
- [languages/dart/MODULE.md](languages/dart/MODULE.md)
- [languages/kotlin-android/MODULE.md](languages/kotlin-android/MODULE.md)
- [languages/rust/MODULE.md](languages/rust/MODULE.md) (stub)

## Drift playbook

`apply` never overwrites existing files. Audit **drift** means Target content ≠ template.

For each drifted path, pick one deliberately:

1. **Keep** — Target policy wins; leave as-is (audit will keep reporting drift).
2. **Merge** — fold useful template rules into the existing file by hand.
3. **Replace** — back up, then copy the template over (human/agent deliberate; not `apply`).

Common dart case: stock Flutter `analysis_options.yaml` vs kit defaults — usually **merge** (keep `flutter_lints` include; adopt kit `analyzer.exclude` / strict linter rules you want).

Common kotlin-android case: an existing `config/detekt/detekt.yml` — **merge** the kit's Compose rules section and Composable/Preview exemptions into it.

## Workflows

### Audit

1. `pnpm run audit -- --target <repo>` (read-only).
2. Report packs (with host/fragment roles), missing/drifted files, script gaps (js-ts), orphan-Fragment warnings.
3. Done when the report lists every gap; do not modify the Target.

### Adopt (existing repo)

1. Prefer a clean working tree; work on a branch. If WIP must stay, isolate quality-gate files in the adopt commit.
2. Resolve packs (detect or `--packs`). Read each pack `MODULE.md`.
3. `pnpm apply -- --target <repo>`. Never overwrites existing files.
4. Follow pack post-apply steps (MODULE + apply “Next” output).
5. Clear first-pass gate failures (format, analyze, secrets, deps, tests). If the repo has an adoption checklist issue, tick it; otherwise MODULE post-apply + green gate is enough.
6. Merge `AGENTS.quality.md` into `AGENTS.md`.
7. Done when the Host gate is green (`pnpm gate` or `./tools/quality/gate.sh full`).

#### Kotlin / Android (Jetpack Compose) happy path

```bash
pnpm run audit -- --target ~/mycode/<repo> --packs kotlin-android
# branch, then:
pnpm apply -- --target ~/mycode/<repo> --packs kotlin-android
# 3 Gradle lines → merge gradle.quality.properties + AGENTS → doctor.sh → lefthook install
# → run-format.sh --fix → screenshots.sh record → gate.sh full
```

#### Dart / Flutter happy path

```bash
pnpm run audit -- --target ~/mycode/<repo> --packs dart
# branch, then:
pnpm apply -- --target ~/mycode/<repo> --packs dart
# roots → Betterleaks/lefthook → lefthook install → merge AGENTS → gate.sh full
```

### New (greenfield)

1. Create the app (`pnpm create vite`, `flutter create`, an Android Studio / AGP Compose template, or equivalent).
2. Same as Adopt steps 2–7.
3. js-ts: set `biome.complexity.json` `maxAllowedComplexity` to **15** (template default is 25 for legacy) — see js-ts module. kotlin-android: set `qualityKit.minLineCoverage=80` (template default 0 for legacy).
4. Done when the pack gate is green.

## Reference

- Domain terms: [GLOSSARY.md](GLOSSARY.md)
- Shared ratchet / Desired state / apply / CI: [REFERENCE.md](REFERENCE.md)
- Adoption specs (examples): [sim-iq#296](https://github.com/bilalbox/sim-iq/issues/296), [lenses#2](https://github.com/bilalbox/lenses/issues/2), [taseel#7](https://github.com/bilalbox/taseel/issues/7), [arcgym#23](https://github.com/bilalbox/arcgym/issues/23)
