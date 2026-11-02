# Pack: kotlin-android

Detect: root `settings.gradle(.kts)` plus an Android Gradle Plugin reference (`com.android.application|library` or `com.android.tools.build:gradle`) in a root build file, settings, or `gradle/libs.versions.toml`. Root-only, so Flutter / React Native `android/` builds never match. Templates: `languages/kotlin-android/templates/`.

Standalone Host for Jetpack Compose apps and libraries: `tools/quality/*.sh`, lefthook, GitHub Actions, and an included Gradle build (`build-logic/quality`) that owns every Gradle-side tool and pin.

## Tools

| Concern | Tool | Gate |
| --- | --- | --- |
| Format | **ktfmt** `--kotlinlang-style` (native binary, auto-downloaded + sha256-checked; jar fallback); `run-format.sh --fix [files…]` formats in place | fast, pre-commit (staged content, no JVM) |
| Static analysis | **detekt 2.0** + **compose-rules** (`config/detekt/detekt.yml`) | fast |
| Compiler | Kotlin `allWarningsAsErrors` (main + unit-test sources) | fast |
| Secrets | **Betterleaks v1** (Shared layer; see languages/shared/MODULE.md) | fast, pre-commit. Pack allowlist `.betterleaks.d/kotlin-android.toml`: `build/`, `.gradle/`, `.kotlin/`, `*.png`, `local.properties`, `key(store).properties`, `*.jks`, `*.keystore` |
| Dependency vulns | **osv-scanner** (Shared layer; see languages/shared/MODULE.md) | full (`gate.sh` / `make vulns`) |
| Lint | **Android Lint**, warnings as errors (`config/lint/lint.xml`) | full |
| Tests | JUnit + **Robolectric** (`testDebugUnitTest`) | full |
| Screenshots | **Roborazzi** verify; every `@Preview` auto-generated into a test (ComposablePreviewScanner) | full |
| Coverage | **Kover** line floor (`qualityKit.minLineCoverage`) | full |
| Dependencies | **dependency-analysis** `buildHealth`, all advice fatal | full |
| Hooks | **lefthook** | pre-commit: secrets + format check of staged content (see Pre-commit format); pre-push: full |
| Orchestration | `tools/quality/gate.sh` → `./gradlew -q --continue qualityFast|qualityFull` | — |

`gate.sh` runs every step even after a failure and ends with a summary: failing steps, `*_compare.png` diff images to open, and previews that have no golden yet.

## Pre-commit format

`run-format.sh --staged` checks what will be committed, not the working tree: each staged `.kt` / `.kts` blob is piped from the index into `ktfmt --dry-run --set-exit-if-changed --stdin-name=<path> -`. It never formats or re-stages files, so unstaged hunks of a partially staged file stay out of the commit whether the hook runs through lefthook or a plain `.git/hooks/pre-commit`.

A misformatted staged file fails the hook and prints the fix command:

```text
fix: ./tools/quality/run-format.sh --fix app/src/main/kotlin/A.kt && git add app/src/main/kotlin/A.kt
```

Files that also have unstaged changes get `git add -p <file>` instead, so only the formatted hunks are re-staged. lefthook hides unstaged hunks while the hook runs; the script reads lefthook's `info/lefthook-unstaged.patch` to still spot them.

## Wiring (post-apply)

`apply` never edits existing build files, so wire three lines by hand:

```kotlin
// settings.gradle.kts
pluginManagement {
    includeBuild("build-logic/quality")
    // repositories { google(); mavenCentral(); gradlePluginPortal() }
}

// build.gradle.kts (root) — next to AGP / Kotlin `apply false`
plugins { id("quality-kit.root") }

// <module>/build.gradle.kts — after com.android.application|library
plugins { id("quality-kit.android") }
```

`quality-kit.root` applies dependency-analysis and the root `qualityFull` → `buildHealth`. `quality-kit.android` applies detekt, Kover, and Roborazzi; configures Lint, test JVMs, and preview generation; and registers `qualityFast` / `qualityFull`.

Remove direct detekt / Kover / Roborazzi / dependency-analysis plugin declarations from module builds: `build-logic/quality/gradle/libs.versions.toml` owns those versions.

## Config

Merge `gradle.quality.properties` into the root `gradle.properties`:

| Property | Default | Meaning |
| --- | --- | --- |
| `org.gradle.configuration-cache` | `true` | All gate plugins are compatible; a warm `gate.sh fast` is ~5 s |
| `qualityKit.variant` | `debug` | Variant for compile / lint / test / Roborazzi / Kover tasks |
| `qualityKit.minLineCoverage` | `0` | Kover line floor per module. Greenfield: **80**, raise only |
| `qualityKit.allWarningsAsErrors` | `true` | Set `false` temporarily on legacy adopts |
| `qualityKit.addTestDependencies` | `true` | Adds Roborazzi / Robolectric / preview-scanner / `ui-test-junit4` (via the module's Compose BOM) |

Baselines (legacy only; never for new code): `<module>/detekt-baseline.xml` (`./gradlew detektBaseline`) and `<module>/lint-baseline.xml` (`./gradlew updateLintBaseline`) are picked up automatically when present.

## Screenshots

- Goldens: `<module>/src/test/screenshots/*.png`, committed to git.
- `./tools/quality/screenshots.sh record` re-records and prunes goldens for deleted previews.
- `compare` writes `build/outputs/roborazzi/*_compare.png` (Reference | Diff | New) without failing; `verify` is what the full gate runs.
- Preview tests run on Robolectric SDK 36 at `Pixel5` qualifiers, so the output does not depend on the module's `targetSdk`.
- Rendering is deterministic per OS/arch. Record goldens on Linux x86_64 (CI or WSL/container), not macOS, or CI will report diffs.

## Headless environments

- `./tools/quality/doctor.sh` checks the JDK (17+, 21 recommended), Android SDK + licenses, `compileSdk` platforms, tools, and Gradle wiring, and prints a fix command for each failure.
- Test JVMs get `java.awt.headless=true` (Roborazzi draws diff labels with AWT) and `--add-opens java.base/jdk.internal.access` (Robolectric SDK 36 on JDK 17+).
- `LD_LIBRARY_PATH` entries under `…/emulator/` are stripped for test JVMs: the emulator's bundled Qt `libfreetype` breaks AWT font loading (`X11FontManager` / `FT_Get_Transform`).
- Robolectric downloads `android-all-instrumented` jars (~200 MB per SDK) into `~/.m2/repository/org/robolectric` on first run. Sandboxes without network need that directory pre-seeded; CI caches it.
- Test JVMs: 2 GB heap, forks = min(4, CPUs / 2).

## Known upstream gaps

- AGP 9.5: `./gradlew tasks` (eager realization) fails with "Compose Preview failed … unit tests are disabled for this variant", even without this pack. Gate tasks are unaffected.
- dependency-analysis 3.20 warns that AGP 9.5 is untested; the analysis still runs.
- detekt is pinned to **2.0.0-alpha.6**: compose-rules 0.6.3+ requires it for Kotlin 2.4 syntax (detekt 1.23.x stops at Kotlin 2.0).
- Compose BOM 2026.09+ (Compose 1.12) needs `compileSdk` 37.

## Placement kinds

Everything not listed is **owned** (audit reports drift), including `config/detekt/detekt.yml` and `config/lint/lint.xml`. Shared-layer files: see [languages/shared/MODULE.md](../shared/MODULE.md).

- **merge-into:** `AGENTS.quality.md` → `AGENTS.md` (`## Definition of Done (Mandatory Gate)`); `gradle.quality.properties` → `gradle.properties` (all four `qualityKit.*` keys; values may be tuned); `Makefile` → itself (`gate-fast:` and `gate:` targets)

## Wiring probes

audit checks the Wiring section was done (see REFERENCE.md "Wiring probes"):

- **git hooks installed (lefthook)**: `pre-commit` and `pre-push` installed by `lefthook install`.
- **settings includes the quality build-logic**: `settings.gradle(.kts)` has `includeBuild("build-logic/quality")`.
- **root build applies quality-kit.root**: root `build.gradle(.kts)` has `id("quality-kit.root")`.
- **each Android module applies quality-kit.android**: every subproject build (depth ≤ 4; `build-logic/` and `buildSrc/` skipped) that names `com.android.application|library`, or a `libs.plugins.android.application|library` catalog alias, must have `id("quality-kit.android")`. Each unwired module is reported by its build file. Decision: if no module applies `quality-kit.android` at all, the probe fails too (the gate's `qualityFast` / `qualityFull` tasks would not exist), so AGP aliases the probe does not recognise cannot pass silently.

## Post-apply

`apply` prints this list as its "Next" output, so it is the only copy of these steps. Keep each step on one line.

1. Wire the build (see Wiring): `settings.gradle.kts` `pluginManagement { includeBuild("build-logic/quality") }`; root `build.gradle.kts` `plugins { id("quality-kit.root") }`; each Android module `plugins { id("quality-kit.android") }` after `com.android.*`.
2. Merge `gradle.quality.properties` → `gradle.properties`; merge `AGENTS.quality.md` → `AGENTS.md`.
3. `./tools/quality/doctor.sh`; install Betterleaks v1.9.0+ and osv-scanner (see languages/shared/MODULE.md) and lefthook; `lefthook install`.
4. If `Makefile` already existed, add `gate` / `gate-fast` targets that call `./tools/quality/gate.sh`.
5. `./tools/quality/run-format.sh --fix` (one formatting commit), then `./tools/quality/screenshots.sh record` and inspect the goldens.
6. `./tools/quality/gate.sh full`; fix findings, or baseline legacy detekt / Lint findings deliberately.

## Pins

| Tool | Pin |
| --- | --- |
| AGP API (compile-only) / Kotlin Gradle API | 9.5.0 / 2.4.21 |
| detekt / compose-rules | 2.0.0-alpha.6 / 0.6.8 |
| Kover | 0.9.11 |
| Roborazzi / Robolectric (SDK) / ComposablePreviewScanner | 1.77.0 / 4.17 (36) / 0.9.3 |
| dependency-analysis | 3.20.0 |
| ktfmt | 0.65 (`KTFMT_VERSION`) |
| Betterleaks | Shared layer pin (languages/shared/MODULE.md) |
| osv-scanner | Shared layer pin (languages/shared/MODULE.md) |
| CI | `setup-java@v6` (Temurin 21), `setup-android@v4`, `gradle/actions/setup-gradle@v6` |
