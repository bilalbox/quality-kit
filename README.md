# quality-kit

Copy-in templates and a skill for shared quality gates by language pack: JS/TS (Biome, `tsc -b`, rev-dep, complexity ratchet, husky/CI), optional Python (`uvx`), Dart/Flutter (format, analyze, Betterleaks, dependency_validator, lefthook/CI), with Rust reserved.

## Use

```bash
pnpm install
pnpm run audit -- --target ~/mycode/<repo>
pnpm apply -- --target ~/mycode/<repo>
pnpm apply -- --target ~/mycode/<repo> --packs js-ts,python
pnpm apply -- --target ~/mycode/<repo> --packs dart
```

Packs are detected from the target, or set with `--packs`. `--python` force-adds the python Fragment.

`js-ts` detection ignores stub `package.json` files with no dependencies (common in Flutter repos). Python detection ignores helper-script dirs (`tool/`, `scripts/`, …) so Flutter `tool/*.py` does not pull the Fragment; use `--packs dart` for Dart hosts. Override with `--packs` when needed.

Agent skill: [SKILL.md](SKILL.md) (symlinked as `quality-gates`, user-invoked). Bare invoke → audit, then ask before adopt. Shared reference: [REFERENCE.md](REFERENCE.md). Pack modules: `languages/*/MODULE.md`.

## Layout

- `languages/<pack>/templates/` — files `apply` copies into a target repo
- `languages/<pack>/MODULE.md` — pack tools, pins, post-apply steps
- `scripts/packs/` — Pack adapters (detect + Contribution)
- `scripts/desired-state.ts` — Desired state build + diff
- `scripts/audit.ts` / `scripts/apply.ts` — thin adapters over Desired state
- `GLOSSARY.md` — domain terms (Pack, Desired state, Target, …)
