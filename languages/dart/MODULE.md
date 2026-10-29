# Pack: dart

Detect: any `pubspec.yaml` within depth 3 (root app or nested `app/`). Templates: `languages/dart/templates/`.

Standalone host (not composed onto js-ts): Makefile / `tools/quality/*.sh`, lefthook, Flutter CI.

## Tools

| Concern | Tool | Notes |
| --- | --- | --- |
| Format | **`dart format`** | `--output=none --set-exit-if-changed` per package root. |
| Lint / types | **`flutter analyze --fatal-infos`** (or `dart analyze`) | Stock `flutter_lints` via package `analysis_options.yaml`. |
| Secrets | **Betterleaks v1** | Same pin/contract as js-ts; bash wrapper (no Node). |
| Dependencies | **dependency_validator 5.1.0** | Missing / unused / over-/under-promoted deps. Activated via `dart pub global`. |
| Hooks | **lefthook** | pre-commit: secrets + format staged; pre-push: full gate. |
| Orchestration | **`tools/quality/gate.sh`** | `fast` = format + analyze + secrets + deps; `full` = fast + test. |

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

1. Set `quality-kit.dart.json` `roots` (and `flutterEnv` if the repo has one).
2. Install Betterleaks v1.9.0+ and lefthook on the host; run `lefthook install`.
3. If `Makefile` already existed, add `gate` / `gate-fast` targets that call `./tools/quality/gate.sh`.
4. Merge `AGENTS.quality.md` into `AGENTS.md`.
5. `./tools/quality/gate.sh full`.

## Pins

| Tool | Pin |
| --- | --- |
| Betterleaks | 1.9.0 (1.x line) |
| dependency_validator | 5.1.0 |
| lefthook | latest stable release binary |
| Flutter | `subosito/flutter-action` `channel: stable` (override per repo if needed) |
