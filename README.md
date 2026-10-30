# quality-kit

Copy-in templates and a skill for shared quality gates by language pack: JS/TS (Biome, `tsc -b`, rev-dep, complexity ratchet, husky/CI), optional Python (`uvx`), Dart/Flutter (format, analyze, Betterleaks, dependency_validator, lefthook/CI), Kotlin/Android Jetpack Compose (ktfmt, detekt + compose-rules, Lint, Robolectric + Roborazzi screenshot tests, Kover, dependency-analysis, lefthook/CI), with Rust reserved.

## Use

```bash
pnpm install
pnpm run audit -- --target ~/mycode/<repo>
pnpm apply -- --target ~/mycode/<repo>
pnpm apply -- --target ~/mycode/<repo> --packs js-ts,python
pnpm apply -- --target ~/mycode/<repo> --packs dart
pnpm apply -- --target ~/mycode/<repo> --packs kotlin-android
```

Packs are detected from the target, or set with `--packs`. `--python` force-adds the python Fragment.

`js-ts` detection ignores stub `package.json` files with no dependencies (common in Flutter repos). Python detection ignores helper-script dirs (`tool/`, `scripts/`, …) so Flutter `tool/*.py` does not pull the Fragment; use `--packs dart` for Dart hosts. Override with `--packs` when needed.

Agent skill: [SKILL.md](SKILL.md) (`quality-gates`, user-invoked). Bare invoke → audit, then ask before adopt.

The skill is installed by symlinking this repo, so edits here are live everywhere. Keep **both** installs:

```bash
ln -sfn ~/mycode/quality-kit ~/.agents/skills/quality-gates   # Cursor / agents
ln -sfn ~/mycode/quality-kit ~/.claude/skills/quality-gates   # Claude Code
```

When adding or renaming the skill, or moving the repo, update both links. Shared reference: [REFERENCE.md](REFERENCE.md). Pack modules: `languages/*/MODULE.md`.

## Layout

- `languages/<pack>/templates/` — files `apply` copies into a target repo
- `languages/<pack>/MODULE.md` — pack tools, pins, post-apply steps
- `languages/kotlin-android/templates/build-logic/quality/` — Gradle convention plugins (`quality-kit.root`, `quality-kit.android`) copied into the Target
- `scripts/packs/` — Pack adapters (detect + Contribution)
- `scripts/desired-state.ts` — Desired state build + diff
- `scripts/audit.ts` / `scripts/apply.ts` — thin adapters over Desired state
- `GLOSSARY.md` — domain terms (Pack, Desired state, Target, …)
