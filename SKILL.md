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
pnpm apply -- --target ~/mycode/<repo> --python   # alias: add python pack
```

Packs are detected from the target (`package.json` → `js-ts`, `.py` → `python`, `Cargo.toml` → `rust`, `pubspec.yaml` → `dart`), or overridden with `--packs`. After apply (js-ts): tune entry points → `pnpm install` → seed baselines → merge `AGENTS.quality.md` into `AGENTS.md`.

## Packs

Before pack-specific steps, **read** each selected pack's module:

- [languages/js-ts/MODULE.md](languages/js-ts/MODULE.md)
- [languages/python/MODULE.md](languages/python/MODULE.md)
- [languages/rust/MODULE.md](languages/rust/MODULE.md) (stub)
- [languages/dart/MODULE.md](languages/dart/MODULE.md) (stub)

`rust` / `dart` detect only; templates not shipped yet. Adopt/new below assume a `js-ts` host (`pnpm gate`).

## Workflows

### Audit

1. `pnpm run audit -- --target <repo>` (read-only).
2. Report packs, missing/drifted template files, and package.json script gaps (js-ts).
3. Done when the report lists every gap; do not modify the target.

### Adopt (existing repo)

1. Confirm working tree is clean; work on a branch.
2. Resolve packs (detect or `--packs`). Read each pack `MODULE.md`.
3. `pnpm apply -- --target <repo>`. Never overwrites existing files.
4. Follow pack post-apply steps (js-ts: rev-dep entry points, `allowBuilds.esbuild`, install, seed baselines).
5. Fix first-pass debt per the repo's spec issue.
6. Merge `AGENTS.quality.md` into `AGENTS.md`. `pnpm gate` must pass.
7. Done when `pnpm gate` is green and the spec-issue checklist for this step is ticked.

### New (greenfield)

1. Create the app (`pnpm create vite` or equivalent).
2. Same as Adopt steps 2–6, but set `biome.complexity.json` `maxAllowedComplexity` to **15** (template default is 25 for legacy) — see js-ts module.
3. Done when `pnpm gate` is green on an empty baseline.

## Reference

- Shared ratchet / apply / CI: [REFERENCE.md](REFERENCE.md)
- Adoption specs: [sim-iq#296](https://github.com/bilalbox/sim-iq/issues/296), [lenses#2](https://github.com/bilalbox/lenses/issues/2), [taseel#7](https://github.com/bilalbox/taseel/issues/7), [arcgym#23](https://github.com/bilalbox/arcgym/issues/23)
