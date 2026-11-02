import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { readText } from "../kit-fs";
import { type FileKind, placeFiles } from "./placements";
import { postApplySteps } from "./post-apply";
import { sharedPlacements } from "./shared";
import type { Contribution, Pack, WiringProbe } from "./types";
import { listFiles } from "./walk";
import { hooksInstalledProbe, LEFTHOOK } from "./wiring";

/** Host scripts under tools/quality/kotlin-android/; shared root files are composed (see local.ts). */
const ROOT_FILES: Record<string, FileKind> = {
	".betterleaks.d/kotlin-android.toml": "owned",
	"gradle.quality.properties": {
		dest: "gradle.properties",
		markers: [
			"qualityKit.variant",
			"qualityKit.minLineCoverage",
			"qualityKit.allWarningsAsErrors",
			"qualityKit.addTestDependencies",
		],
	},
	".github/actions/setup-android/action.yml": "owned",
	".github/actions/kotlin-android-quality-gate/action.yml": "owned",
	"config/detekt/detekt.yml": "owned",
	"config/lint/lint.xml": "owned",
	"build-logic/quality/settings.gradle.kts": "owned",
	"build-logic/quality/build.gradle.kts": "owned",
	"build-logic/quality/gradle/libs.versions.toml": "owned",
	"build-logic/quality/src/main/kotlin/QualityKitRootPlugin.kt": "owned",
	"build-logic/quality/src/main/kotlin/QualityKitAndroidPlugin.kt": "owned",
	"tools/quality/kotlin-android/lib.sh": "owned",
	"tools/quality/kotlin-android/gate.sh": "owned",
	"tools/quality/kotlin-android/run-format.sh": "owned",
	"tools/quality/kotlin-android/screenshots.sh": "owned",
	"tools/quality/kotlin-android/doctor.sh": "owned",
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

type GradleBuild = { rel: string; code: string };

/** Comments stripped so commented-out wiring does not count. */
function readGradle(target: string, rel: string): GradleBuild {
	const code = readText(join(target, rel))
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");
	return { rel, code };
}

/** Kotlin DSL first, then Groovy. */
function gradleBuild(target: string, base: string): GradleBuild | null {
	const rel = [`${base}.kts`, base].find((r) => existsSync(join(target, r)));
	return rel ? readGradle(target, rel) : null;
}

const INCLUDES_QUALITY_BUILD =
	/\bincludeBuild\s*\(?\s*["']build-logic\/quality["']/;

/** `id("…")` (Kotlin DSL) or `id '…'` (Groovy) in a plugins block. */
function appliesPlugin(code: string, pluginId: string): boolean {
	const escaped = pluginId.replace(/\./g, "\\.");
	return new RegExp(`\\bid\\s*\\(?\\s*["']${escaped}["']`).test(code);
}

/** AGP module plugin by id, or by the usual version-catalog alias names. */
const ANDROID_MODULE =
	/["']com\.android\.(application|library)["']|\blibs\.plugins\.android[._-]?(application|library)\b/i;

/** Included builds never hold app modules; build-logic/quality is the kit's own. */
const NOT_MODULE_DIRS = new Set(["build-logic", "buildSrc", ".gradle"]);

/** Every subproject build file (root excluded), comments stripped. */
function moduleBuilds(target: string): GradleBuild[] {
	return listFiles(
		target,
		4,
		(name) => name === "build.gradle.kts" || name === "build.gradle",
		(rel) => NOT_MODULE_DIRS.has(rel),
	)
		.filter((rel) => dirname(rel) !== ".")
		.map((rel) => readGradle(target, rel));
}

const ANDROID_MODULE_FIX =
	'add id("quality-kit.android") to plugins { } after com.android.application|library';

const PROBES: readonly WiringProbe[] = [
	hooksInstalledProbe(LEFTHOOK),
	{
		label: "settings includes the quality build-logic",
		check(target) {
			const settings = gradleBuild(target, "settings.gradle");
			if (settings && INCLUDES_QUALITY_BUILD.test(settings.code)) return [];
			return [
				{
					detail: settings?.rel ?? "settings.gradle(.kts) missing",
					fix: 'add includeBuild("build-logic/quality") inside pluginManagement { } in settings.gradle.kts',
				},
			];
		},
	},
	{
		label: "root build applies quality-kit.root",
		check(target) {
			const root = gradleBuild(target, "build.gradle");
			if (root && appliesPlugin(root.code, "quality-kit.root")) return [];
			return [
				{
					detail: root?.rel ?? "build.gradle(.kts) missing",
					fix: 'add id("quality-kit.root") to plugins { } in the root build.gradle.kts',
				},
			];
		},
	},
	{
		label: "each Android module applies quality-kit.android",
		check(target) {
			const modules = moduleBuilds(target);
			const unwired = modules.filter(
				(m) =>
					ANDROID_MODULE.test(m.code) &&
					!appliesPlugin(m.code, "quality-kit.android"),
			);
			if (unwired.length > 0) {
				return unwired.map((m) => ({ detail: m.rel, fix: ANDROID_MODULE_FIX }));
			}
			if (modules.some((m) => appliesPlugin(m.code, "quality-kit.android"))) {
				return [];
			}
			return [
				{
					detail: "no module applies it, so qualityFast / qualityFull do not exist",
					fix: `in each Android module build: ${ANDROID_MODULE_FIX}`,
				},
			];
		},
	},
];

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
			probes: PROBES,
		};
	},
};
