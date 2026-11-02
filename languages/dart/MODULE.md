# Pack: dart

Detect: any `pubspec.yaml` within depth 3 (root app or nested `app/`). Templates: `languages/dart/templates/`.

Standalone host (not composed onto js-ts): Makefile / `tools/quality/*.sh`, lefthook, Flutter CI.

## Tools

| Concern | Tool | Notes |
| --- | --- | --- |
| Format | **`dart format`** | `--output=none --set-exit-if-changed` per package root; `run-format.sh --fix [files…]` formats in place. |
| Lint / types | **`flutter analyze --fatal-infos`** (or `dart analyze`) | Stock `flutter_lints` via package `analysis_options.yaml`. |
| Secrets | **Betterleaks v1** | Same pin/contract as js-ts; bash wrapper (no Node). |
| Dependencies | **dependency_validator 5.1.0** | Missing / unused / over-/under-promoted deps. Activated via `dart pub global`. |
| Hooks | **lefthook** | pre-commit: secrets + format check of staged content (see Pre-commit format); pre-push: full gate. |
| Orchestration | **`tools/quality/gate.sh`** | `fast` = format + analyze + secrets + deps; `full` = fast + test. |

## Pre-commit format

`run-format.sh --staged` checks what will be committed, not the working tree: each staged `.dart` blob is piped from the index into `dart format --set-exit-if-changed --stdin-name=<path>` (so the package's `analysis_options.yaml` and language version still apply). It never formats or re-stages files, so unstaged hunks of a partially staged file stay out of the commit whether the hook runs through lefthook or a plain `.git/hooks/pre-commit`.

A misformatted staged file fails the hook and prints the fix command:

```text
fix: ./tools/quality/run-format.sh --fix lib/a.dart && git add lib/a.dart
```

Files that also have unstaged changes get `git add -p <file>` instead, so only the formatted hunks are re-staged. lefthook hides unstaged hunks while the hook runs; the script reads lefthook's `info/lefthook-unstaged.patch` to still spot them.

## Config

`quality-kit.dart.json` at repo root:

```json
{
  "roots": ["app"],
  "flutterEnv": "tools/flutter-env.sh"
}
```

- **`roots`**: package dirs that contain `pubspec.yaml`. Empty → auto-detect (`.` if root pubspec, else depth-1, else depth-2).
- **`flutterEnv`**: optional script that wraps Flutter/Dart (e.g. WSL Linux Flutter scrubber). Ignored when missing.

## Secrets (Betterleaks)

Same as js-ts (pin **1.9.0+**, offline only). Wrapper: `tools/quality/run-secret-scan.sh`.

- Pre-commit: `--staged`
- Local gate: `dir .`
- CI (`CI=true`): `git --log-opts=origin/main..HEAD` (fallback: full `git`)

CI installs the binary in `setup-flutter`.

## dependency_validator

Pin **5.1.0** (`dart pub global activate dependency_validator 5.1.0`). Config per package: `dart_dependency_validator.yaml`. Tune `ignore` for tooling packages (`flutter_lints`, `flutter_launcher_icons`, …).

## Post-apply

1. Set `quality-kit.dart.json` `roots` (and `flutterEnv` if the repo has one). Root Flutter apps usually keep `["."]`.
2. Install Betterleaks v1.9.0+ and lefthook on the host; run `lefthook install`.
3. If `Makefile` already existed, add `gate` / `gate-fast` targets that call `./tools/quality/gate.sh`.
4. Merge `AGENTS.quality.md` into `AGENTS.md`.
5. Resolve **drift** deliberately (see skill Drift playbook). Stock Flutter `analysis_options.yaml` often drifts from the kit template — prefer **merge** over blind replace.
6. `./tools/quality/gate.sh full`.

Helper `tool/*.py` scripts do not require the python pack; adopt with `--packs dart` unless the repo has a real Python product surface.

## Pins

| Tool | Pin |
| --- | --- |
| Betterleaks | 1.9.0 (1.x line) |
| dependency_validator | 5.1.0 |
| lefthook | latest stable release binary |
| Flutter | `subosito/flutter-action` `channel: stable` (override per repo if needed) |
