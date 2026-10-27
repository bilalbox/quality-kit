---
name: quality-gates
description: Copy-in quality kit (Biome, rev-dep, complexity ratchet, optional Python via uvx). Use when auditing or adopting quality gates, scaffolding gate:fast, or standardizing lint/typecheck/CI across repos.
---

# Quality gates

Canonical templates live in this repo (`templates/`). Workflows: **audit**, **adopt**, **new**.

## Quick start

```bash
# From quality-kit:
pnpm audit -- --target ~/mycode/<repo>
pnpm apply -- --target ~/mycode/<repo>          # JS/TS only
pnpm apply -- --target ~/mycode/<repo> --python # force Python templates
```

Then in the target: adjust `rev-dep.config.json` entry points → `pnpm install` → seed baselines → merge `AGENTS.quality.md` into `AGENTS.md`.

## Workflows

### Audit

1. `pnpm audit -- --target <repo>` (read-only).
2. Report missing/drifted template files and package.json script gaps.
3. Done when the report lists every gap; do not modify the target.

### Adopt (existing repo)

1. Confirm working tree is clean; work on a branch.
2. `pnpm apply -- --target <repo>` (add `--python` if needed). Never overwrites existing files.
3. Merge `allowBuilds.esbuild` into an existing `pnpm-workspace.yaml` if apply skipped it.
4. Tune `rev-dep.config.json` (`prodEntryPoints`, `moduleBoundaries`).
5. `pnpm install`.
6. Seed: `pnpm lint:complexity -- --update` then `pnpm lint:graph -- --update-snapshot` (creates `.rev-dep.*.json` — do not hand-write).
7. Fix first-pass debt per the repo's spec issue (NUIA, Biome reformat, cycles).
8. Merge `AGENTS.quality.md` into `AGENTS.md`. `pnpm gate` must pass.
9. Done when `pnpm gate` is green and the spec-issue checklist for this step is ticked.

### New (greenfield)

1. Create the app (`pnpm create vite` or equivalent).
2. Same as Adopt steps 2–8, but set `biome.complexity.json` `maxAllowedComplexity` to **15** (template default is 25 for legacy).
3. Done when `pnpm gate` is green on an empty baseline.

## Reference

- Tool rationale, ratchet contract, gotchas: [REFERENCE.md](REFERENCE.md)
- Adoption specs: [sim-iq#296](https://github.com/bilalbox/sim-iq/issues/296), [lenses#2](https://github.com/bilalbox/lenses/issues/2), [taseel#7](https://github.com/bilalbox/taseel/issues/7), [arcgym#23](https://github.com/bilalbox/arcgym/issues/23)
