plugins {
    `kotlin-dsl`
}

group = "quality-kit"

dependencies {
    compileOnly(libs.android.gradle.api)
    compileOnly(libs.kotlin.gradle.plugin.api)
    implementation(libs.detekt.gradle.plugin)
    implementation(libs.kover.gradle.plugin)
    implementation(libs.roborazzi.gradle.plugin)
    implementation(libs.dependency.analysis.gradle.plugin)
}

val generateVersions =
    tasks.register("generateQualityKitVersions") {
        val versions =
            mapOf(
                "COMPOSE_RULES" to libs.versions.composeRules.get(),
                "ROBORAZZI" to libs.versions.roborazzi.get(),
                "ROBOLECTRIC" to libs.versions.robolectric.get(),
                "ROBOLECTRIC_SDK" to libs.versions.robolectricSdk.get(),
                "COMPOSABLE_PREVIEW_SCANNER" to libs.versions.composablePreviewScanner.get(),
                "JUNIT" to libs.versions.junit.get(),
            )
        val outDir = layout.buildDirectory.dir("generated/qualityKit")
        inputs.property("versions", versions)
        outputs.dir(outDir)
        doLast {
            val body = versions.entries.joinToString("\n") { (k, v) -> "    const val $k = \"$v\"" }
            val file = outDir.get().file("QualityKitVersions.kt").asFile
            file.parentFile.mkdirs()
            file.writeText("internal object QualityKitVersions {\n$body\n}\n")
        }
    }

kotlin.sourceSets.named("main") { kotlin.srcDir(generateVersions) }

gradlePlugin {
    plugins {
        register("qualityKitRoot") {
            id = "quality-kit.root"
            implementationClass = "QualityKitRootPlugin"
        }
        register("qualityKitAndroid") {
            id = "quality-kit.android"
            implementationClass = "QualityKitAndroidPlugin"
        }
    }
}
