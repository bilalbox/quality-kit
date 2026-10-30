## Definition of Done (Mandatory Gate)

Before considering any code change or task done (even when not pushing), **always run `./tools/quality/gate.sh fast` first** (or `make gate-fast`). Run **`./tools/quality/gate.sh full`** before declaring UI, test, dependency, or manifest work complete.

Do not declare completion with only piecemeal checks (a single Gradle task, one test class, or format alone). Each gate runs every step and reports all failures in one pass.

`gate.sh fast`:

1. ktfmt (`--kotlinlang-style`) check — fix with `./tools/quality/run-format.sh --fix`
2. Betterleaks secret scan
3. `./gradlew qualityFast` — detekt (with Compose rules) + compile main and unit-test sources with warnings as errors

`gate.sh full` = fast + Android Lint (warnings as errors), unit tests, Roborazzi screenshot verification, Kover coverage floor, and dependency analysis (`buildHealth`). CI and pre-push run `full`.

A task is not complete until `gate.sh fast` passes cleanly (and `full` for UI/dependency changes).

## Screenshot tests (Roborazzi, JVM-only)

- Every `@Preview` in a module's namespace becomes a screenshot test automatically; no emulator or device is needed.
- Goldens live in `<module>/src/test/screenshots/` and are committed.
- When the gate reports screenshot diffs, **open the listed `*_compare.png` images** (Reference | Diff | New) before deciding anything.
- Intended visual change: `./tools/quality/screenshots.sh record`, inspect the changed PNGs, and commit them with the code change.
- Unintended change: fix the code; never re-record to make a failing gate pass.
- New UI should come with a `@Preview` (light and, where relevant, dark / large-font variants).

## Fixing failures

- detekt / Compose rules: fix the code. Suppress (`@Suppress("RuleId")`) only with a reason in the same change; never add to `detekt-baseline.xml` for new code.
- Lint: fix the issue. `lint-baseline.xml` is for legacy findings only.
- `buildHealth`: apply the printed dependency advice exactly (add, remove, or change configuration).
- Environment problems (SDK, JDK, tools): run `./tools/quality/doctor.sh`.
