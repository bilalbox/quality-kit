import com.autonomousapps.DependencyAnalysisExtension
import org.gradle.api.GradleException
import org.gradle.api.Plugin
import org.gradle.api.Project

/**
 * Root project plugin: dependency analysis (buildHealth) and the root half of the `qualityFast` /
 * `qualityFull` lifecycle tasks. Running `./gradlew qualityFull` executes the same-named task in
 * every project that applies a quality-kit plugin.
 */
class QualityKitRootPlugin : Plugin<Project> {
    override fun apply(project: Project) {
        if (project != project.rootProject) {
            throw GradleException("quality-kit.root must be applied to the root project only")
        }
        project.pluginManager.apply("com.autonomousapps.dependency-analysis")
        project.extensions.configure(DependencyAnalysisExtension::class.java) {
            issues {
                all {
                    onAny { severity("fail") }
                    // Roborazzi's preview generator requires it declared; only generated code uses
                    // it.
                    onUnusedDependencies { exclude(PREVIEW_SCANNER) }
                }
            }
            reporting { printBuildHealth(true) }
        }

        val fast =
            project.tasks.register(QualityKitTasks.FAST) {
                group = QualityKitTasks.GROUP
                description = "quality-kit fast gate (root): no root checks yet"
            }
        project.tasks.register(QualityKitTasks.FULL) {
            group = QualityKitTasks.GROUP
            description = "quality-kit full gate (root): dependency analysis"
            dependsOn(fast, "buildHealth")
        }
    }
}

internal const val PREVIEW_SCANNER = "io.github.sergio-sastre.ComposablePreviewScanner:android"

internal object QualityKitTasks {
    const val GROUP = "quality-kit"
    const val FAST = "qualityFast"
    const val FULL = "qualityFull"
}
