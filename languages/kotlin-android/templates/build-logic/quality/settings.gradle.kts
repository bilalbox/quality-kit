// quality-kit convention plugins — included from the Target's settings.gradle.kts:
//   pluginManagement { includeBuild("build-logic/quality") }
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

rootProject.name = "quality"
