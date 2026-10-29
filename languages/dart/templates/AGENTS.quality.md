## Definition of Done (Mandatory Gate)

Before considering any code change or task done (even when not pushing), **always run `./tools/quality/gate.sh fast` first** (or `make gate-fast` when wired).

Do not declare completion with only piecemeal checks (`flutter analyze` alone, format alone, or a single test file). `gate.sh fast` bundles:

1. `dart format --set-exit-if-changed` (per package root)
2. `flutter analyze --fatal-infos` (or `dart analyze`)
3. Betterleaks secret scan
4. `dependency_validator` (missing / unused / mis-promoted deps)

`./tools/quality/gate.sh full` = fast + `flutter test` (CI and pre-push).

A task is not complete until `gate.sh fast` passes cleanly.
