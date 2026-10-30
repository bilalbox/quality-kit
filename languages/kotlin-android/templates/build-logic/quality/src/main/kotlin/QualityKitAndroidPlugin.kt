import com.android.build.api.dsl.CommonExtension
import com.github.takahirom.roborazzi.ExperimentalRoborazziApi
import dev.detekt.gradle.Detekt
import dev.detekt.gradle.extensions.DetektExtension
import io.github.takahirom.roborazzi.RoborazziExtension
import kotlinx.kover.gradle.plugin.dsl.KoverProjectExtension
import org.gradle.api.GradleException
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.tasks.testing.Test
import org.gradle.api.tasks.testing.logging.TestExceptionFormat
import org.gradle.api.tasks.testing.logging.TestLogEvent
import org.jetbrains.kotlin.gradle.tasks.KotlinCompilationTask

/**
 * Android module plugin. Apply after `com.android.application` or `com.android.library`.
 *
 * Gradle properties (root `gradle.properties` or `-P`):
 * - `qualityKit.variant` (default `debug`)
 * - `qualityKit.minLineCoverage` (default `0` = no Kover rule)
 * - `qualityKit.allWarningsAsErrors` (default `true`)
 * - `qualityKit.addTestDependencies` (default `true`): Roborazzi / Robolectric / preview scanner
 */
class QualityKitAndroidPlugin : Plugin<Project> {
    override fun apply(project: Project) {
        var configured = false
        for (id in listOf("com.android.application", "com.android.library")) {
            project.pluginManager.withPlugin(id) {
                if (!configured) {
                    configured = true
                    project.configureAndroidModule()
                }
            }
        }
        project.afterEvaluate {
            if (!configured) {
                throw GradleException(
                    "quality-kit.android: ${project.path} must also apply " +
                        "com.android.application or com.android.library",
                )
            }
        }
    }
}

private const val MAX_TEST_FORKS = 4

private fun Project.flag(name: String, default: Boolean): Boolean =
    providers.gradleProperty(name).map { it.toBoolean() }.getOrElse(default)

private fun Project.configureAndroidModule() {
    val variant = providers.gradleProperty("qualityKit.variant").getOrElse("debug")
    val variantTask = variant.replaceFirstChar(Char::uppercaseChar)

    pluginManager.apply("dev.detekt")
    pluginManager.apply("org.jetbrains.kotlinx.kover")
    pluginManager.apply("io.github.takahirom.roborazzi")
    if (rootProject.pluginManager.hasPlugin("quality-kit.root")) {
        pluginManager.apply("com.autonomousapps.dependency-analysis")
    } else {
        logger.warn("quality-kit.android: apply quality-kit.root in the root build for buildHealth")
    }

    configureAndroidDsl()
    configureKotlinCompile()
    configureDetekt()
    configureKover(variant)
    configureTests()
    configureRoborazzi()

    val fast =
        tasks.register(QualityKitTasks.FAST) {
            group = QualityKitTasks.GROUP
            description = "quality-kit fast gate: detekt + compile ($variant, main and unit test)"
            dependsOn(
                "detekt",
                "compile${variantTask}Kotlin",
                "compile${variantTask}UnitTestKotlin",
            )
        }
    tasks.register(QualityKitTasks.FULL) {
        group = QualityKitTasks.GROUP
        description = "quality-kit full gate: fast + lint + unit/screenshot tests + coverage"
        dependsOn(
            fast,
            "lint$variantTask",
            "verifyRoborazzi$variantTask",
            "koverVerify$variantTask",
        )
    }
}

private fun Project.configureAndroidDsl() {
    val lintConfig = rootProject.file("config/lint/lint.xml")
    val lintBaseline = file("lint-baseline.xml")
    extensions.configure(CommonExtension::class.java) {
        testOptions.unitTests.isIncludeAndroidResources = true
        with(lint) {
            abortOnError = true
            warningsAsErrors = true
            checkReleaseBuilds = false
            if (lintConfig.exists()) this.lintConfig = lintConfig
            if (lintBaseline.exists()) baseline = lintBaseline
        }
    }
}

private fun Project.configureKotlinCompile() {
    val warningsAsErrors = flag("qualityKit.allWarningsAsErrors", true)
    tasks.withType(KotlinCompilationTask::class.java).configureEach {
        compilerOptions.allWarningsAsErrors.set(warningsAsErrors)
    }
}

private fun Project.configureDetekt() {
    val baselineFile = file("detekt-baseline.xml")
    extensions.configure(DetektExtension::class.java) {
        buildUponDefaultConfig.set(true)
        parallel.set(true)
        config.setFrom(rootProject.file("config/detekt/detekt.yml"))
        basePath.set(rootProject.layout.projectDirectory)
        if (baselineFile.exists()) baseline.set(baselineFile)
    }
    dependencies.add(
        "detektPlugins",
        "io.nlopez.compose.rules:detekt:${QualityKitVersions.COMPOSE_RULES}",
    )
    tasks.withType(Detekt::class.java).configureEach {
        reports {
            checkstyle.required.set(false)
            html.required.set(false)
            markdown.required.set(false)
        }
    }
}

private fun Project.configureKover(variant: String) {
    val minLine =
        providers.gradleProperty("qualityKit.minLineCoverage").map(String::toInt).getOrElse(0)
    extensions.configure(KoverProjectExtension::class.java) {
        reports {
            filters {
                excludes {
                    annotatedBy("androidx.compose.ui.tooling.preview.Preview")
                    classes("*.BuildConfig", "*.ComposableSingletons*", "*_Factory", "*_Factory$*")
                }
            }
            variant(variant) {
                verify {
                    if (minLine > 0) rule { minBound(minLine) }
                }
            }
        }
    }
}

private fun Project.configureTests() {
    val forks = (Runtime.getRuntime().availableProcessors() / 2).coerceIn(1, MAX_TEST_FORKS)
    // The emulator's bundled Qt libfreetype shadows the system one and breaks AWT font loading.
    val ldLibraryPath =
        providers.environmentVariable("LD_LIBRARY_PATH").orNull?.split(':')?.filterNot {
            it.contains("/emulator/")
        }
    tasks.withType(Test::class.java).configureEach {
        if (ldLibraryPath != null) environment("LD_LIBRARY_PATH", ldLibraryPath.joinToString(":"))
        systemProperty("robolectric.pixelCopyRenderMode", "hardware")
        // Roborazzi draws diff labels with AWT; without this it needs an X11 display.
        systemProperty("java.awt.headless", "true")
        // Robolectric SDK 36 reflects into jdk.internal.access on JDK 17+.
        jvmArgs("--add-opens=java.base/jdk.internal.access=ALL-UNNAMED")
        maxHeapSize = "2g"
        maxParallelForks = forks
        testLogging {
            events(TestLogEvent.FAILED)
            exceptionFormat = TestExceptionFormat.FULL
            // gate.sh runs Gradle with -q; keep failures (and Roborazzi diff paths) visible.
            quiet {
                events(TestLogEvent.FAILED)
                exceptionFormat = TestExceptionFormat.SHORT
            }
        }
    }
}

@OptIn(ExperimentalRoborazziApi::class)
private fun Project.configureRoborazzi() {
    extensions.configure(RoborazziExtension::class.java) {
        outputDir.set(layout.projectDirectory.dir("src/test/screenshots"))
    }
    pluginManager.withPlugin("org.jetbrains.kotlin.plugin.compose") {
        val android = extensions.getByType(CommonExtension::class.java)
        extensions.configure(RoborazziExtension::class.java) {
            generateComposePreviewRobolectricTests {
                enable.set(true)
                packages.set(provider { listOfNotNull(android.namespace) })
                includePrivatePreviews.set(true)
                generatedTestClassCount.set(MAX_TEST_FORKS)
                robolectricConfig.set(
                    mapOf(
                        "sdk" to "[${QualityKitVersions.ROBOLECTRIC_SDK}]",
                        "qualifiers" to "RobolectricDeviceQualifiers.Pixel5",
                    ),
                )
            }
        }
        if (flag("qualityKit.addTestDependencies", true)) addScreenshotTestDependencies()
    }
}

/** Declared exactly as dependency-analysis expects, so buildHealth stays green. */
private fun Project.addScreenshotTestDependencies() {
    val r = QualityKitVersions.ROBORAZZI
    val robolectric = QualityKitVersions.ROBOLECTRIC
    listOf(
            "io.github.takahirom.roborazzi:roborazzi-core:$r",
            "io.github.takahirom.roborazzi:roborazzi-compose-preview-scanner-support:$r",
            "$PREVIEW_SCANNER:${QualityKitVersions.COMPOSABLE_PREVIEW_SCANNER}",
            "org.robolectric:robolectric:$robolectric",
            "org.robolectric:annotations:$robolectric",
            "junit:junit:${QualityKitVersions.JUNIT}",
            // Versionless: resolved through the module's Compose BOM.
            "androidx.compose.ui:ui-test-junit4",
        )
        .forEach { dependencies.add("testImplementation", it) }
    dependencies.add("testRuntimeOnly", "io.github.takahirom.roborazzi:roborazzi:$r")
    dependencies.add("debugRuntimeOnly", "androidx.compose.ui:ui-test-manifest")
}
