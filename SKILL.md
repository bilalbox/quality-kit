---
name: quality-gates
description: Copy-in quality gates by language pack. Invoke to audit or adopt.
disable-model-invocation: true
---

# Quality gates

Language packs live under `languages/`. Workflows: **audit**, **adopt**, **new**.

## Quick start

```bash
# From quality-kit:
pnpm run audit -- --target ~/mycode/<repo>
pnpm apply -- --target ~/mycode/<repo>
pnpm apply -- --target ~/mycode/<repo> --packs js-ts,python
pnpm apply -- --target ~/mycode/<repo> --packs dart
pnpm apply -- --target ~/mycode/<repo> --python   # alias: add python pack
```

Packs are detected from the target (`package.json` → `js-ts`, `.py` → `python`, `Cargo.toml` → `rust`, `pubspec.yaml` within depth 3 → `dart`), or overridden with `--packs`.

- After apply (**js-ts**): tune entry points → `pnpm install` → seed baselines → merge `AGENTS.quality.md` into `AGENTS.md`.
- After apply (**dart**): set `quality-kit.dart.json` roots → install Betterleaks + lefthook → `lefthook install` → merge `AGENTS.quality.md` → `./tools/quality/gate.sh full`.

`js-ts` detection requires real `dependencies` / `devDependencies` (stub Flutter `package.json` files are ignored).

## Packs

Before pack-specific steps, **read** each selected pack's module:

- [languages/js-ts/MODULE.md](languages/js-ts/MODULE.md)
- [languages/python/MODULE.md](languages/python/MODULE.md)
- [languages/dart/MODULE.md](languages/dart/MODULE.md)
- [languages/rust/MODULE.md](languages/rust/MODULE.md) (stub)

`rust` detects only; templates not shipped yet. Python composes onto a `js-ts` host. Dart is a standalone host (`./tools/quality/gate.sh`).

## Workflows

### Audit

1. `pnpm run audit -- --target <repo>` (read-only).
2. Report packs, missing/drifted template files, and package.json script gaps (js-ts).
3. Done when the report lists every gap; do not modify the target.

### Adopt (existing repo)

1. Confirm working tree is clean; work on a branch.
2. Resolve packs (detect or `--packs`). Read each pack `MODULE.md`.
3. `pnpm apply -- --target <repo>`. Never overwrites existing files.
4. Follow pack post-apply steps.
5. Fix first-pass debt per the repo's spec issue.
6. Merge `AGENTS.quality.md` into `AGENTS.md`. Gate must pass (`pnpm gate` or `./tools/quality/gate.sh full`).
7. Done when the gate is green and the spec-issue checklist for this step is ticked.

### New (greenfield)

1. Create the app (`pnpm create vite`, `flutter create`, or equivalent).
2. Same as Adopt steps 2–6.
3. js-ts: set `biome.complexity.json` `maxAllowedComplexity` to **15** (template default is 25 for legacy) — see js-ts module.
4. Done when the pack gate is green.

## Reference

- Shared ratchet / apply / CI: [REFERENCE.md](REFERENCE.md)
- Adoption specs: [sim-iq#296](https://github.com/bilalbox/sim-iq/issues/296), [lenses#2](https://github.com/bilalbox/lenses/issues/2), [taseel#7](https://github.com/bilalbox/taseel/issues/7), [arcgym#23](https://github.com/bilalbox/arcgym/issues/23)
