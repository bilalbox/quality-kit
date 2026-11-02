import { existsSync } from "node:fs";
import { join } from "node:path";
import { readText } from "../kit-fs";
import { AGENTS_MD, type FileKind, placeFiles } from "./placements";
import { postApplySteps } from "./post-apply";
import { sharedPlacements } from "./shared";
import type { Contribution, Pack } from "./types";

const ROOT_FILES: Record<string, FileKind> = {
	"lefthook.yml": "owned",
	".editorconfig": "owned",
	".betterleaks.d/kotlin-android.toml": "owned",
	Makefile: { dest: "Makefile", markers: ["gate-fast:", "gate:"] },
	"AGENTS.quality.md": AGENTS_MD,
	"gradle.quality.properties": {
		dest: "gradle.properties",
		markers: [
			"qualityKit.variant",
			"qualityKit.minLineCoverage",
			"qualityKit.allWarningsAsErrors",
			"qualityKit.addTestDependencies",
		],
	},
	".github/workflows/ci.yml": "owned",
	".github/actions/setup-android/action.yml": "owned",
	".github/actions/quality-gate/action.yml": "owned",
	"config/detekt/detekt.yml": "owned",
	"config/lint/lint.xml": "owned",
	"build-logic/quality/settings.gradle.kts": "owned",
	"build-logic/quality/build.gradle.kts": "owned",
	"build-logic/quality/gradle/libs.versions.toml": "owned",
	"build-logic/quality/src/main/kotlin/QualityKitRootPlugin.kt": "owned",
	"build-logic/quality/src/main/kotlin/QualityKitAndroidPlugin.kt": "owned",
	"tools/quality/lib.sh": "owned",
	"tools/quality/gate.sh": "owned",
	"tools/quality/run-format.sh": "owned",
	"tools/quality/screenshots.sh": "owned",
	"tools/quality/doctor.sh": "owned",
};

/** Root build files that name the Android Gradle Plugin in Gradle Android projects. */
const ANDROID_SIGNAL_FILES = [
	"build.gradle.kts",
	"build.gradle",
	"settings.gradle.kts",
	"settings.gradle",
	"gradle/libs.versions.toml",
] as const;

const ANDROID_PLUGIN =
	/com\.android\.(application|library)|com\.android\.tools\.build:gradle/;

/**
 * Root Gradle build that uses AGP. Root-only on purpose: Flutter and React Native
 * keep their Gradle build under android/, which this pack does not own.
 */
export function detectKotlinAndroid(target: string): boolean {
	const hasSettings =
		existsSync(join(target, "settings.gradle.kts")) ||
		existsSync(join(target, "settings.gradle"));
	if (!hasSettings) return false;
	return ANDROID_SIGNAL_FILES.some((rel) => {
		const path = join(target, rel);
		return existsSync(path) && ANDROID_PLUGIN.test(readText(path));
	});
}

export const kotlinAndroidPack: Pack = {
	id: "kotlin-android",
	kind: "host",
	detect: detectKotlinAndroid,
	contribute(_target: string, _selected: readonly string[]): Contribution {
		return {
			rootPlacements: [
				...placeFiles("kotlin-android", ROOT_FILES),
				...sharedPlacements("kotlin-android"),
			],
			packagePlacements: [],
			nextSteps: postApplySteps("kotlin-android"),
		};
	},
};
