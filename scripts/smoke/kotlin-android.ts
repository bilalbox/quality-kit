/**
 * Minimal AGP + Jetpack Compose application (Empty Activity shape).
 * compileSdk 36 + Compose BOM 2026.06.01 (2026.09+ needs platform 37).
 */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { appendFragment, mergeAgentsMd, sh } from "./run";
import type { HostSmoke } from "./types";

const PKG = "dev.qualitykit.smoke";
const PKG_PATH = "dev/qualitykit/smoke";

const APP_BUILD = `plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "${PKG}"
    compileSdk = 36

    defaultConfig {
        applicationId = "${PKG}"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures { compose = true }
}

kotlin { jvmToolchain(21) }

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.androidx.activity)
    implementation(libs.androidx.activity.compose)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.runtime)
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.text)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)
}
`;

const APP_BUILD_WIRED = APP_BUILD.replace(
	`plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}`,
	`plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    id("quality-kit.android")
}`,
);

function write(target: string, rel: string, body: string): void {
	const path = join(target, rel);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, body);
}

function scaffoldComposeApp(target: string): void {
	mkdirSync(target, { recursive: true });

	write(
		target,
		".gitignore",
		`/.gradle/
/build/
**/build/
/local.properties
/.idea/
*.iml
.DS_Store
captures/
`,
	);

	write(
		target,
		"settings.gradle.kts",
		`pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "quality-kit-smoke"
include(":app")
`,
	);

	write(
		target,
		"build.gradle.kts",
		`plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
}
`,
	);

	write(
		target,
		"gradle.properties",
		`org.gradle.jvmargs=-Xmx2g -Dfile.encoding=UTF-8
android.useAndroidX=true
`,
	);

	write(
		target,
		"gradle/libs.versions.toml",
		`[versions]
agp = "9.5.0"
kotlin = "2.4.21"
# 2026.09+ needs compileSdk 37; smoke stays on 36.
composeBom = "2026.06.01"
activityCompose = "1.13.0"

[libraries]
androidx-activity = { module = "androidx.activity:activity", version.ref = "activityCompose" }
androidx-activity-compose = { module = "androidx.activity:activity-compose", version.ref = "activityCompose" }
compose-bom = { module = "androidx.compose:compose-bom", version.ref = "composeBom" }
compose-foundation = { module = "androidx.compose.foundation:foundation" }
compose-material3 = { module = "androidx.compose.material3:material3" }
compose-runtime = { module = "androidx.compose.runtime:runtime" }
compose-ui = { module = "androidx.compose.ui:ui" }
compose-ui-text = { module = "androidx.compose.ui:ui-text" }
compose-ui-tooling = { module = "androidx.compose.ui:ui-tooling" }
compose-ui-tooling-preview = { module = "androidx.compose.ui:ui-tooling-preview" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
`,
	);

	write(target, "app/build.gradle.kts", APP_BUILD);

	write(
		target,
		"app/src/main/res/drawable/ic_launcher.xml",
		`<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#FF5722"
        android:pathData="M0,0h108v108h-108z" />
</vector>
`,
	);

	write(
		target,
		"app/src/main/AndroidManifest.xml",
		`<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:allowBackup="false"
        android:dataExtractionRules="@xml/data_extraction_rules"
        android:fullBackupContent="@xml/backup_rules"
        android:icon="@drawable/ic_launcher"
        android:label="Quality Kit Smoke"
        android:roundIcon="@drawable/ic_launcher"
        android:supportsRtl="true"
        android:theme="@android:style/Theme.Material.Light.NoActionBar">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`,
	);

	write(
		target,
		"app/src/main/res/xml/data_extraction_rules.xml",
		`<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="root" />
        <exclude domain="file" />
        <exclude domain="database" />
        <exclude domain="sharedpref" />
        <exclude domain="external" />
    </cloud-backup>
    <device-transfer>
        <exclude domain="root" />
        <exclude domain="file" />
        <exclude domain="database" />
        <exclude domain="sharedpref" />
        <exclude domain="external" />
    </device-transfer>
</data-extraction-rules>
`,
	);

	write(
		target,
		"app/src/main/res/xml/backup_rules.xml",
		`<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
    <exclude domain="root" path="." />
    <exclude domain="file" path="." />
    <exclude domain="database" path="." />
    <exclude domain="sharedpref" path="." />
    <exclude domain="external" path="." />
</full-backup-content>
`,
	);

	write(
		target,
		`app/src/main/kotlin/${PKG_PATH}/MainActivity.kt`,
		`package ${PKG}

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { Greeting() }
    }
}

@Composable
fun Greeting(modifier: Modifier = Modifier) {
    Text(text = "quality-kit smoke", modifier = modifier)
}

@Preview
@Composable
private fun GreetingPreview() {
    Greeting()
}
`,
	);

	write(target, "AGENTS.md", "# Smoke\n");

	const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? "";
	if (sdk) {
		write(target, "local.properties", `sdk.dir=${sdk.replace(/\\/g, "/")}\n`);
	}

	const gradleBin =
		process.env.QUALITY_KIT_GRADLE_BIN ??
		join(
			process.env.HOME ?? "",
			".gradle/wrapper/dists/gradle-9.8.2-bin/8wepis63pzuhrlfaiy04bagwu/gradle-9.8.2/bin/gradle",
		);
	if (!existsSync(gradleBin)) {
		throw new Error(
			`gradle 9.8.2 not found at ${gradleBin}; set QUALITY_KIT_GRADLE_BIN or install the wrapper dist`,
		);
	}
	sh(target, [gradleBin, "wrapper", "--gradle-version", "9.8.2"]);
	chmodSync(join(target, "gradlew"), 0o755);
}

function wireKotlin(target: string): void {
	writeFileSync(
		join(target, "settings.gradle.kts"),
		`pluginManagement {
    includeBuild("build-logic/quality")
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "quality-kit-smoke"
include(":app")
`,
	);

	writeFileSync(
		join(target, "build.gradle.kts"),
		`plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
    id("quality-kit.root")
}
`,
	);

	writeFileSync(join(target, "app/build.gradle.kts"), APP_BUILD_WIRED);

	appendFragment(target, "gradle.quality.properties", "gradle.properties");
	mergeAgentsMd(target);
	sh(target, ["lefthook", "install"]);
	sh(target, ["./tools/quality/kotlin-android/run-format.sh", "--fix"]);
	sh(target, ["./tools/quality/kotlin-android/screenshots.sh", "record"]);
	// Format again: screenshot record may generate sources under build/ that
	// are gitignored; sources we commit stay formatted from the first pass.
	sh(target, ["./tools/quality/kotlin-android/run-format.sh", "--fix"]);
}

export const kotlinAndroidSmoke: HostSmoke = {
	tools: ["java", "betterleaks", "osv-scanner", "lefthook", "git"],
	scaffold: scaffoldComposeApp,
	wire: wireKotlin,
	gate: [["./tools/quality/gate.sh", "full"]],
};
