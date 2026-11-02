# Pack: dart

Detect: any `pubspec.yaml` within depth 3 (root app or nested `app/`). Templates: `languages/dart/templates/`.

Standalone host (not composed onto js-ts): Makefile / `tools/quality/*.sh`, lefthook, Flutter CI.

## Tools

| Concern | Tool | Notes |
| --- | --- | --- |
| Format | **`dart format`** | `--output=none --set-exit-if-changed` per package root; `run-format.sh --fix [files…]` formats in place. |
| Lint / types | **`flutter analyze --fatal-infos`** (or `dart analyze`) | Per-root `analysis_options.yaml`: `flutter_lints` (Flutter) or `lints` (pure Dart) + strict modes. See [Analysis](#analysis). |
| Secrets | **Betterleaks v1** | From the Shared layer (bash wrapper, no Node). |
| Dependency vulns | **osv-scanner** | From the Shared layer; `gate.sh full` / `make vulns`. |
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

`tools/quality/lib.sh` reads this file with bash only (no python3, jq or node needed). Keep it flat as above: string values must not contain escaped quotes (`\"`).

## Analysis

`apply` places one `analysis_options.yaml` per package root and picks the variant from that root's `pubspec.yaml` (same check as `quality_has_flutter` in `lib.sh`: a `flutter:` key):

| Root | Template | Base include |
| --- | --- | --- |
| Flutter app/package | `package/flutter/analysis_options.yaml` | `package:flutter_lints/flutter.yaml` |
| Pure Dart package | `package/dart/analysis_options.yaml` | `package:lints/recommended.yaml` (needs `lints` in `dev_dependencies`; `dart create` adds it, else `dart pub add --dev lints`) |

Both variants turn on the analyzer strict modes (`strict-casts`, `strict-inference`, `strict-raw-types`), exclude generated `*.g.dart` / `*.freezed.dart`, and add the same correctness-focused rules on top of the base set: `always_declare_return_types`, `avoid_dynamic_calls`, `avoid_type_to_string`, `cancel_subscriptions`, `close_sinks`, `literal_only_boolean_expressions`, `no_adjacent_strings_in_list`, `only_throw_errors`, `prefer_void_to_null`, `strict_top_level_inference`, `test_types_in_equals`, `throw_in_finally`, `unawaited_futures`, `unnecessary_statements`. The Flutter variant also keeps `avoid_print` and the `prefer_const_*` rules; pure Dart packages are often CLIs, so `print` is allowed there.

Decision: no style-only rules beyond what `dart format` enforces, and the set must pass unchanged on stock `flutter create` and `dart create -t package` output, so greenfield Targets start green. Keep the two rule lists in sync when changing either.

### Adopting on legacy code

Strict modes usually surface many findings in an existing codebase, and `--fatal-infos` fails on every one. The analyzer has no baseline file, so adopt per root:

1. Merge the kit config into the root's existing `analysis_options.yaml` (keep its include and any deliberate rules), then run `flutter analyze` / `dart analyze` in that root to see the count.
2. `dart fix --apply` for the auto-fixable lint findings.
3. Fix strict-mode findings by hand: add explicit type arguments (`<String, Object?>{}`, `List<int>`), cast decoded JSON (`jsonDecode(s) as Map<String, Object?>`), annotate parameters and return types.
4. If a root cannot be fixed in one change, set only the offending mode to `false` (or the offending rule to `false`) in that root's `analysis_options.yaml` with a `# TODO(quality-kit): re-enable <mode> — <issue link>` comment, and re-enable it root by root. Prefer this over scattering `// ignore:` comments. Never relax the config for new packages.
5. `audit` reports the relaxed file as customized; that is intended (**Keep** in the Drift playbook) until the mode is back on.

## Secrets (Betterleaks)

Config, wrapper (`tools/quality/run-secret-scan.sh`), install and CI step come from the Shared layer: see [languages/shared/MODULE.md](../shared/MODULE.md). lefthook pre-commit runs it with `--staged`; `gate.sh fast` and `make secrets` scan the working tree.

**Pack allowlist** (`.betterleaks.d/dart.toml`): `*_test.dart`, `.dart_tool/`, `build/`, `android/.gradle/`, `android/app/build/`, `.dev.vars*`, `key.properties`, `*.jks`, `*.keystore`.

## Dependency vulns (osv-scanner)

Wrapper, install and CI step come from the Shared layer: see [languages/shared/MODULE.md](../shared/MODULE.md). `gate.sh full` and `make vulns` run `tools/quality/run-vuln-scan.sh`.

## dependency_validator

Pin **5.1.0** (`dart pub global activate dependency_validator 5.1.0`). Config per package: `dart_dependency_validator.yaml`. `ignore` lists only packages that are never imported (codegen/launcher tooling, asset-only `cupertino_icons`). Never ignore runtime deps such as `freezed_annotation` or `json_annotation`: if one is reported unused, remove it from `pubspec.yaml`. Packages referenced from `analysis_options.yaml` (`lints`, `flutter_lints`) are detected as used.

## Placement kinds

Everything not listed is **owned** (audit reports drift), including each package's `analysis_options.yaml`. Shared-layer files: see [languages/shared/MODULE.md](../shared/MODULE.md).

- **seed:** `quality-kit.dart.json`, each package's `dart_dependency_validator.yaml`
- **merge-into:** `AGENTS.quality.md` → `AGENTS.md` (`## Definition of Done (Mandatory Gate)`); `Makefile` → itself (`gate-fast:` and `gate:` targets)

## Wiring probes

audit checks (see REFERENCE.md "Wiring probes"):

- **git hooks installed (lefthook)**: `pre-commit` and `pre-push` installed by `lefthook install`.

## Post-apply

`apply` prints this list as its "Next" output, so it is the only copy of these steps. Keep each step on one line.

1. Set `quality-kit.dart.json` `roots` (and `flutterEnv` if the repo has one). Root Flutter apps usually keep `["."]`.
2. Install Betterleaks v1.9.0+ and osv-scanner (see languages/shared/MODULE.md) and lefthook on the host; run `lefthook install`.
3. If `Makefile` already existed, add `gate` / `gate-fast` targets that call `./tools/quality/gate.sh`.
4. Merge `AGENTS.quality.md` into `AGENTS.md`.
5. Resolve **drift** deliberately (see skill Drift playbook). A stock `analysis_options.yaml` often drifts from the kit template — prefer **merge** over blind replace, and follow "Adopting on legacy code" in `languages/dart/MODULE.md` for the strict modes.
6. `./tools/quality/gate.sh full`.

Helper `tool/*.py` scripts do not require the python pack; adopt with `--packs dart` unless the repo has a real Python product surface.

## Pins

| Tool | Pin |
| --- | --- |
| Betterleaks | Shared layer pin (languages/shared/MODULE.md) |
| osv-scanner | Shared layer pin (languages/shared/MODULE.md) |
| dependency_validator | 5.1.0 |
| lefthook | latest stable release binary |
| Flutter | 3.47.9 (Dart 3.13.7) — `flutter-version` in `.github/actions/setup-flutter/action.yml` |

Bump Flutter deliberately: change `flutter-version`, run `./tools/quality/gate.sh full` locally on the same version, commit. A Target whose `pubspec.yaml` `environment.sdk` needs a newer Dart must raise the pin in its copy of the action (`audit` then reports it customized on purpose).
