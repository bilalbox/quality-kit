import { existsSync } from "node:fs";
import { join } from "node:path";
import { readText } from "../kit-fs";
import type { Contribution, Pack, Placement } from "./types";

const ROOT_COPY_PATHS = [
	"lefthook.yml",
	".editorconfig",
	".betterleaks.toml",
	".betterleaksignore",
	"Makefile",
	"AGENTS.quality.md",
	"gradle.quality.properties",
	".github/workflows/ci.yml",
	".github/actions/setup-android/action.yml",
	".github/actions/quality-gate/action.yml",
	"config/detekt/detekt.yml",
	"config/lint/lint.xml",
	"build-logic/quality/settings.gradle.kts",
	"build-logic/quality/build.gradle.kts",
	"build-logic/quality/gradle/libs.versions.toml",
	"build-logic/quality/src/main/kotlin/QualityKitRootPlugin.kt",
	"build-logic/quality/src/main/kotlin/QualityKitAndroidPlugin.kt",
	"tools/quality/lib.sh",
	"tools/quality/gate.sh",
	"tools/quality/run-format.sh",
	"tools/quality/run-secret-scan.sh",
	"tools/quality/screenshots.sh",
	"tools/quality/doctor.sh",
] as const;

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

function rootPlacements(): Placement[] {
	return ROOT_COPY_PATHS.map((rel) => ({
		pack: "kotlin-android" as const,
		templateRel: rel,
		targetRel: rel,
		executable: rel.endsWith(".sh") ? true : undefined,
	}));
}

export const kotlinAndroidPack: Pack = {
	id: "kotlin-android",
	kind: "host",
	detect: detectKotlinAndroid,
	contribute(_target: string, _selected: readonly string[]): Contribution {
		return {
			rootPlacements: rootPlacements(),
			packagePlacements: [],
		};
	},
};
