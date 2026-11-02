/**
 * Single pins source (`pins.json`) and sync check against templates/docs.
 * Templates and docs keep version literals; bump pins.json and every site
 * together — `pinDrift()` fails when they diverge.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { kitRoot } from "./kit-fs";

export type DepRange = "exact" | "caret";

export type DepPin = {
	version: string;
	range: DepRange;
};

export type Pins = {
	biome: string;
	flutter: string;
	dartSdk: string;
	dependencyValidator: string;
	ktfmt: string;
	betterleaks: {
		version: string;
		sha256: { linux_x64: string; linux_arm64: string };
	};
	osvScanner: {
		version: string;
		sha256: { linux_amd64: string; linux_arm64: string };
	};
	shellcheck: { version: string; sha256: string };
	actionlint: { version: string; sha256: string };
	python: {
		ruff: string;
		basedpyright: string;
		tach: string;
		vulture: string;
	};
	kotlin: {
		agp: string;
		kotlin: string;
		detekt: string;
		composeRules: string;
		kover: string;
		roborazzi: string;
		robolectric: string;
		robolectricSdk: string;
		composablePreviewScanner: string;
		dependencyAnalysis: string;
		junit: string;
	};
	jsTsDevDependencies: Record<string, DepPin>;
	actions: {
		"setup-java": string;
		"setup-android": string;
		"setup-gradle": string;
		"flutter-action": string;
		"pnpm-action-setup": string;
		"setup-node": string;
		cache: string;
		checkout: string;
	};
	kit: { pnpm: string; node: string };
};

export type PinDrift = { file: string; detail: string };

const PINS_PATH = join(kitRoot, "pins.json");

export function loadPins(): Pins {
	return JSON.parse(readFileSync(PINS_PATH, "utf8")) as Pins;
}

function read(rel: string): string {
	return readFileSync(join(kitRoot, rel), "utf8");
}

function relOf(abs: string): string {
	return relative(kitRoot, abs).split("\\").join("/");
}

/** One expected capture in a file; `pattern` must have a single capture group. */
type Site = {
	file: string;
	pattern: RegExp;
	expected: string;
	label: string;
};

function sitesFor(pins: Pins): Site[] {
	const bl = pins.betterleaks;
	const osv = pins.osvScanner;
	const py = pins.python;
	const k = pins.kotlin;
	const a = pins.actions;
	return [
		{
			file: "languages/js-ts/templates/package.devDependencies.json",
			pattern: /"@biomejs\/biome": "([^"]+)"/,
			expected: pins.biome,
			label: "biome dep",
		},
		{
			file: "languages/js-ts/templates/biome.json",
			pattern: /biomejs\.dev\/schemas\/([^/]+)\//,
			expected: pins.biome,
			label: "biome $schema",
		},
		{
			file: "languages/js-ts/templates/biome.complexity.json",
			pattern: /biomejs\.dev\/schemas\/([^/]+)\//,
			expected: pins.biome,
			label: "biome.complexity $schema",
		},
		{
			file: "package.json",
			pattern: /"@biomejs\/biome": "([^"]+)"/,
			expected: pins.biome,
			label: "kit biome dep",
		},
		{
			file: "languages/js-ts/MODULE.md",
			pattern: /pinned \*\*exactly\*\* \(`([^`]+)`/,
			expected: pins.biome,
			label: "js-ts MODULE biome pin",
		},
		{
			file: "languages/js-ts/MODULE.md",
			pattern: /^\| `@biomejs\/biome` \| \*\*exact\*\* `([^`]+)`/m,
			expected: pins.biome,
			label: "js-ts MODULE Pins biome",
		},
		{
			file: "languages/dart/templates/.github/actions/setup-flutter/action.yml",
			pattern: /^\s+flutter-version:\s*(\S+)\s*$/m,
			expected: pins.flutter,
			label: "flutter-version",
		},
		{
			file: "languages/dart/templates/.github/actions/setup-flutter/action.yml",
			pattern: /dependency_validator (\S+)/,
			expected: pins.dependencyValidator,
			label: "setup-flutter dependency_validator",
		},
		{
			file: "languages/dart/templates/.github/actions/setup-flutter/action.yml",
			pattern: /subosito\/flutter-action@(v\d+)/,
			expected: a["flutter-action"],
			label: "flutter-action tag",
		},
		{
			file: "languages/dart/templates/tools/quality/dart/lib.sh",
			pattern: /DEPENDENCY_VALIDATOR_VERSION="\$\{DEPENDENCY_VALIDATOR_VERSION:-([^}]+)\}"/,
			expected: pins.dependencyValidator,
			label: "DEPENDENCY_VALIDATOR_VERSION",
		},
		{
			file: "languages/dart/MODULE.md",
			pattern: /^\| Flutter \| (\S+)/m,
			expected: pins.flutter,
			label: "dart MODULE Flutter",
		},
		{
			file: "languages/dart/MODULE.md",
			pattern: /^\| dependency_validator \| (\S+)/m,
			expected: pins.dependencyValidator,
			label: "dart MODULE dependency_validator",
		},
		{
			file: "languages/dart/MODULE.md",
			pattern: /Flutter \| [\d.]+ \(Dart ([\d.]+)\)/,
			expected: pins.dartSdk,
			label: "dart MODULE Dart SDK",
		},
		{
			file: "languages/kotlin-android/templates/tools/quality/kotlin-android/lib.sh",
			pattern: /KTFMT_VERSION="\$\{KTFMT_VERSION:-([^}]+)\}"/,
			expected: pins.ktfmt,
			label: "KTFMT_VERSION",
		},
		{
			file: "languages/kotlin-android/MODULE.md",
			pattern: /^\| ktfmt \| (\S+)/m,
			expected: pins.ktfmt,
			label: "kotlin MODULE ktfmt",
		},
		{
			file: "languages/kotlin-android/templates/build-logic/quality/gradle/libs.versions.toml",
			pattern: /^agp = "([^"]+)"/m,
			expected: k.agp,
			label: "agp",
		},
		{
			file: "languages/kotlin-android/templates/build-logic/quality/gradle/libs.versions.toml",
			pattern: /^kotlin = "([^"]+)"/m,
			expected: k.kotlin,
			label: "kotlin",
		},
		{
			file: "languages/kotlin-android/templates/build-logic/quality/gradle/libs.versions.toml",
			pattern: /^detekt = "([^"]+)"/m,
			expected: k.detekt,
			label: "detekt",
		},
		{
			file: "languages/kotlin-android/templates/build-logic/quality/gradle/libs.versions.toml",
			pattern: /^composeRules = "([^"]+)"/m,
			expected: k.composeRules,
			label: "composeRules",
		},
		{
			file: "languages/kotlin-android/templates/build-logic/quality/gradle/libs.versions.toml",
			pattern: /^kover = "([^"]+)"/m,
			expected: k.kover,
			label: "kover",
		},
		{
			file: "languages/kotlin-android/templates/build-logic/quality/gradle/libs.versions.toml",
			pattern: /^roborazzi = "([^"]+)"/m,
			expected: k.roborazzi,
			label: "roborazzi",
		},
		{
			file: "languages/kotlin-android/templates/build-logic/quality/gradle/libs.versions.toml",
			pattern: /^robolectric = "([^"]+)"/m,
			expected: k.robolectric,
			label: "robolectric",
		},
		{
			file: "languages/kotlin-android/templates/build-logic/quality/gradle/libs.versions.toml",
			pattern: /^robolectricSdk = "([^"]+)"/m,
			expected: k.robolectricSdk,
			label: "robolectricSdk",
		},
		{
			file: "languages/kotlin-android/templates/build-logic/quality/gradle/libs.versions.toml",
			pattern: /^composablePreviewScanner = "([^"]+)"/m,
			expected: k.composablePreviewScanner,
			label: "composablePreviewScanner",
		},
		{
			file: "languages/kotlin-android/templates/build-logic/quality/gradle/libs.versions.toml",
			pattern: /^dependencyAnalysis = "([^"]+)"/m,
			expected: k.dependencyAnalysis,
			label: "dependencyAnalysis",
		},
		{
			file: "languages/kotlin-android/templates/build-logic/quality/gradle/libs.versions.toml",
			pattern: /^junit = "([^"]+)"/m,
			expected: k.junit,
			label: "junit",
		},
		{
			file: "languages/kotlin-android/templates/.github/actions/setup-android/action.yml",
			pattern: /actions\/setup-java@(v\d+)/,
			expected: a["setup-java"],
			label: "setup-java",
		},
		{
			file: "languages/kotlin-android/templates/.github/actions/setup-android/action.yml",
			pattern: /android-actions\/setup-android@(v\d+)/,
			expected: a["setup-android"],
			label: "setup-android",
		},
		{
			file: "languages/kotlin-android/templates/.github/actions/setup-android/action.yml",
			pattern: /gradle\/actions\/setup-gradle@(v\d+)/,
			expected: a["setup-gradle"],
			label: "setup-gradle",
		},
		{
			file: "languages/kotlin-android/MODULE.md",
			pattern:
				/^\| AGP API \(compile-only\) \/ Kotlin Gradle API \| ([^/]+) \/ (\S+)/m,
			expected: `${k.agp} / ${k.kotlin}`,
			label: "kotlin MODULE AGP/Kotlin",
		},
		{
			file: "languages/kotlin-android/MODULE.md",
			pattern: /^\| detekt \/ compose-rules \| ([^/]+) \/ (\S+)/m,
			expected: `${k.detekt} / ${k.composeRules}`,
			label: "kotlin MODULE detekt/compose-rules",
		},
		{
			file: "languages/kotlin-android/MODULE.md",
			pattern: /^\| Kover \| (\S+)/m,
			expected: k.kover,
			label: "kotlin MODULE Kover",
		},
		{
			file: "languages/kotlin-android/MODULE.md",
			pattern:
				/^\| Roborazzi \/ Robolectric \(SDK\) \/ ComposablePreviewScanner \| ([^/]+) \/ ([^/]+) \/ (\S+)/m,
			expected: `${k.roborazzi} / ${k.robolectric} (${k.robolectricSdk}) / ${k.composablePreviewScanner}`,
			label: "kotlin MODULE Roborazzi row",
		},
		{
			file: "languages/kotlin-android/MODULE.md",
			pattern: /^\| dependency-analysis \| (\S+)/m,
			expected: k.dependencyAnalysis,
			label: "kotlin MODULE dependency-analysis",
		},
		{
			file: "languages/kotlin-android/MODULE.md",
			pattern:
				/`setup-java@(v\d+)` \(Temurin 21\), `setup-android@(v\d+)`, `gradle\/actions\/setup-gradle@(v\d+)`/,
			expected: `${a["setup-java"]} / ${a["setup-android"]} / ${a["setup-gradle"]}`,
			label: "kotlin MODULE CI actions",
		},
		{
			file: "languages/shared/templates/tools/quality/install-betterleaks.sh",
			pattern: /^VERSION=(\S+)/m,
			expected: bl.version,
			label: "Betterleaks VERSION",
		},
		{
			file: "languages/shared/templates/tools/quality/install-betterleaks.sh",
			pattern:
				/linux_x64\.tar\.gz"\n\t\tsha256=([a-f0-9]{64})/m,
			expected: bl.sha256.linux_x64,
			label: "Betterleaks linux_x64 sha256",
		},
		{
			file: "languages/shared/templates/tools/quality/install-betterleaks.sh",
			pattern:
				/linux_arm64\.tar\.gz"\n\t\tsha256=([a-f0-9]{64})/m,
			expected: bl.sha256.linux_arm64,
			label: "Betterleaks linux_arm64 sha256",
		},
		{
			file: "languages/shared/templates/.betterleaks.toml",
			pattern: /betterleaksMinVersion = "v([^"]+)"/,
			expected: bl.version,
			label: "betterleaksMinVersion",
		},
		{
			file: "languages/shared/MODULE.md",
			pattern: /^\| Betterleaks \| (\S+)/m,
			expected: bl.version,
			label: "shared MODULE Betterleaks",
		},
		{
			file: "languages/shared/templates/tools/quality/install-osv-scanner.sh",
			pattern: /^VERSION=(\S+)/m,
			expected: osv.version,
			label: "osv-scanner VERSION",
		},
		{
			file: "languages/shared/templates/tools/quality/install-osv-scanner.sh",
			pattern:
				/osv-scanner_linux_amd64"\n\t\tsha256=([a-f0-9]{64})/m,
			expected: osv.sha256.linux_amd64,
			label: "osv-scanner linux_amd64 sha256",
		},
		{
			file: "languages/shared/templates/tools/quality/install-osv-scanner.sh",
			pattern:
				/osv-scanner_linux_arm64"\n\t\tsha256=([a-f0-9]{64})/m,
			expected: osv.sha256.linux_arm64,
			label: "osv-scanner linux_arm64 sha256",
		},
		{
			file: "languages/shared/MODULE.md",
			pattern: /^\| osv-scanner \| (\S+)/m,
			expected: osv.version,
			label: "shared MODULE osv-scanner",
		},
		{
			file: "languages/python/templates/package.scripts.json",
			pattern: /uvx ruff@(\S+) check/,
			expected: py.ruff,
			label: "uvx ruff",
		},
		{
			file: "languages/python/templates/package.scripts.json",
			pattern: /uvx basedpyright@(\S+)/,
			expected: py.basedpyright,
			label: "uvx basedpyright",
		},
		{
			file: "languages/python/templates/package.scripts.json",
			pattern: /uvx tach@(\S+) check/,
			expected: py.tach,
			label: "uvx tach",
		},
		{
			file: "languages/python/templates/package.scripts.json",
			pattern: /uvx vulture@(\S+) /,
			expected: py.vulture,
			label: "uvx vulture",
		},
		{
			file: "languages/python/templates/tach.toml",
			pattern: /uvx tach@(\S+) init/,
			expected: py.tach,
			label: "tach.toml seed comment",
		},
		{
			file: "languages/python/MODULE.md",
			pattern:
				/`ruff@([^`]+)`, `basedpyright@([^`]+)`, `tach@([^`]+)`, `vulture@([^`]+)`/,
			expected: `${py.ruff} / ${py.basedpyright} / ${py.tach} / ${py.vulture}`,
			label: "python MODULE Pins",
		},
		{
			file: ".github/workflows/ci.yml",
			pattern: /SHELLCHECK_VERSION=(\S+)/,
			expected: pins.shellcheck.version,
			label: "SHELLCHECK_VERSION",
		},
		{
			file: ".github/workflows/ci.yml",
			pattern: /SHELLCHECK_SHA256=([a-f0-9]{64})/,
			expected: pins.shellcheck.sha256,
			label: "SHELLCHECK_SHA256",
		},
		{
			file: ".github/workflows/ci.yml",
			pattern: /ACTIONLINT_VERSION=(\S+)/,
			expected: pins.actionlint.version,
			label: "ACTIONLINT_VERSION",
		},
		{
			file: ".github/workflows/ci.yml",
			pattern: /ACTIONLINT_SHA256=([a-f0-9]{64})/,
			expected: pins.actionlint.sha256,
			label: "ACTIONLINT_SHA256",
		},
		{
			file: ".github/workflows/ci.yml",
			pattern: /pnpm\/action-setup@(v\d+)/,
			expected: a["pnpm-action-setup"],
			label: "kit pnpm/action-setup",
		},
		{
			file: ".github/workflows/ci.yml",
			pattern: /actions\/setup-node@(v\d+)/,
			expected: a["setup-node"],
			label: "kit setup-node",
		},
		{
			file: ".github/workflows/ci.yml",
			pattern: /actions\/checkout@(v\d+)/,
			expected: a.checkout,
			label: "kit checkout",
		},
		{
			file: ".github/workflows/ci.yml",
			pattern: /^\s+version:\s*(\S+)\s*$/m,
			expected: pins.kit.pnpm,
			label: "kit pnpm version",
		},
		{
			file: ".github/workflows/ci.yml",
			pattern: /node-version:\s*(\S+)/,
			expected: pins.kit.node,
			label: "kit node-version",
		},
		{
			file: "REFERENCE.md",
			pattern: /shellcheck ([\d.]+) and actionlint ([\d.]+)/,
			expected: `${pins.shellcheck.version} / ${pins.actionlint.version}`,
			label: "REFERENCE kit CI pins",
		},
		{
			file: "languages/js-ts/templates/.github/actions/setup-pnpm/action.yml",
			pattern: /pnpm\/action-setup@(v\d+)/,
			expected: a["pnpm-action-setup"],
			label: "js-ts pnpm/action-setup",
		},
		{
			file: "languages/js-ts/templates/.github/actions/setup-pnpm/action.yml",
			pattern: /actions\/setup-node@(v\d+)/,
			expected: a["setup-node"],
			label: "js-ts setup-node",
		},
	];
}

function checkSite(site: Site): PinDrift | null {
	let text: string;
	try {
		text = read(site.file);
	} catch {
		return { file: site.file, detail: `missing file for ${site.label}` };
	}
	const m = text.match(site.pattern);
	if (!m) {
		return {
			file: site.file,
			detail: `${site.label}: pattern did not match`,
		};
	}
	const got =
		m.length > 2
			? m
					.slice(1)
					.filter((c): c is string => c !== undefined)
					.join(" / ")
			: (m[1] ?? "");
	if (got !== site.expected) {
		return {
			file: site.file,
			detail: `${site.label}: expected ${site.expected}, got ${got}`,
		};
	}
	return null;
}

const SCAN_EXTENSIONS = new Set([
	".md",
	".json",
	".yml",
	".yaml",
	".toml",
	".sh",
	".ts",
	".txt",
]);

function walkFiles(dir: string, out: string[]): void {
	for (const name of readdirSync(dir)) {
		if (name === "node_modules" || name === ".git" || name === "dist") {
			continue;
		}
		const abs = join(dir, name);
		const st = statSync(abs);
		if (st.isDirectory()) {
			walkFiles(abs, out);
			continue;
		}
		const dot = name.lastIndexOf(".");
		const ext = dot >= 0 ? name.slice(dot) : "";
		if (SCAN_EXTENSIONS.has(ext) || name === "Dockerfile") out.push(abs);
	}
}

/**
 * Patterns that name a pinned tool and capture a version. Every hit in scanned
 * trees must equal the pin (catches undeclared copy-paste drift).
 */
function scanRules(pins: Pins): { label: string; pattern: RegExp; expected: string }[] {
	const bl = pins.betterleaks.version;
	const osv = pins.osvScanner.version;
	const py = pins.python;
	return [
		{
			label: "biome $schema",
			pattern: /biomejs\.dev\/schemas\/(\d+\.\d+\.\d+)\//g,
			expected: pins.biome,
		},
		{
			label: "@biomejs/biome dep",
			pattern: /"@biomejs\/biome":\s*"(\d+\.\d+\.\d+)"/g,
			expected: pins.biome,
		},
		{
			label: "flutter-version",
			pattern: /flutter-version:\s*(\d+\.\d+\.\d+)/g,
			expected: pins.flutter,
		},
		{
			label: "DEPENDENCY_VALIDATOR_VERSION default",
			pattern:
				/DEPENDENCY_VALIDATOR_VERSION:-(\d+\.\d+\.\d+)/g,
			expected: pins.dependencyValidator,
		},
		{
			label: "dependency_validator activate",
			pattern: /dependency_validator (\d+\.\d+\.\d+)/g,
			expected: pins.dependencyValidator,
		},
		{
			label: "KTFMT_VERSION default",
			pattern: /KTFMT_VERSION:-([\d.]+)/g,
			expected: pins.ktfmt,
		},
		{
			label: "betterleaksMinVersion",
			pattern: /betterleaksMinVersion = "v(\d+\.\d+\.\d+)"/g,
			expected: bl,
		},
		{
			label: "Install Betterleaks floor",
			pattern: /Install v(\d+\.\d+\.\d+)\+/g,
			expected: bl,
		},
		{
			label: "osv-scanner release tag",
			pattern: /osv-scanner\/releases\/download\/v(\d+\.\d+\.\d+)\//g,
			expected: osv,
		},
		{
			label: "osv-scanner MODULE pin",
			pattern: /^\| osv-scanner \| (\d+\.\d+\.\d+)/gm,
			expected: osv,
		},
		{
			label: "SHELLCHECK_VERSION",
			pattern: /SHELLCHECK_VERSION=(\d+\.\d+\.\d+)/g,
			expected: pins.shellcheck.version,
		},
		{
			label: "ACTIONLINT_VERSION",
			pattern: /ACTIONLINT_VERSION=(\d+\.\d+\.\d+)/g,
			expected: pins.actionlint.version,
		},
		{
			label: "uvx ruff",
			pattern: /uvx ruff@([\d.]+)/g,
			expected: py.ruff,
		},
		{
			label: "uvx basedpyright",
			pattern: /uvx basedpyright@([\d.]+)/g,
			expected: py.basedpyright,
		},
		{
			label: "uvx tach",
			pattern: /uvx tach@([\d.]+)/g,
			expected: py.tach,
		},
		{
			label: "uvx vulture",
			pattern: /uvx vulture@([\d.]+)/g,
			expected: py.vulture,
		},
		{
			label: "ruff@ pin prose",
			pattern: /`ruff@([\d.]+)`/g,
			expected: py.ruff,
		},
		{
			label: "basedpyright@ pin prose",
			pattern: /`basedpyright@([\d.]+)`/g,
			expected: py.basedpyright,
		},
		{
			label: "tach@ pin prose",
			pattern: /`tach@([\d.]+)`/g,
			expected: py.tach,
		},
		{
			label: "vulture@ pin prose",
			pattern: /`vulture@([\d.]+)`/g,
			expected: py.vulture,
		},
	];
}

const SCAN_ROOTS = [
	"languages",
	"REFERENCE.md",
	"SKILL.md",
	"README.md",
	"package.json",
	".github/workflows",
];

/**
 * Drift between `pins.json` and version literals in templates/docs.
 * Empty array means in sync.
 */
export function pinDrift(): PinDrift[] {
	const pins = loadPins();
	const drift: PinDrift[] = [];

	for (const site of sitesFor(pins)) {
		const d = checkSite(site);
		if (d) drift.push(d);
	}

	const files: string[] = [];
	for (const root of SCAN_ROOTS) {
		const abs = join(kitRoot, root);
		try {
			const st = statSync(abs);
			if (st.isDirectory()) walkFiles(abs, files);
			else files.push(abs);
		} catch {
			/* optional doc */
		}
	}

	for (const abs of files) {
		const file = relOf(abs);
		// Mock binaries in tests intentionally hard-code a Betterleaks version.
		if (file.startsWith("tests/")) continue;
		const text = readFileSync(abs, "utf8");
		for (const rule of scanRules(pins)) {
			rule.pattern.lastIndex = 0;
			for (const m of text.matchAll(rule.pattern)) {
				const got = m[1];
				if (got !== undefined && got !== rule.expected) {
					drift.push({
						file,
						detail: `${rule.label}: expected ${rule.expected}, got ${got}`,
					});
				}
			}
		}
	}

	// Betterleaks sha256 assignments in the installer.
	const installer = read(
		"languages/shared/templates/tools/quality/install-betterleaks.sh",
	);
	const shaHits = [
		...installer.matchAll(
			/linux_(x64|arm64)\.tar\.gz"\n\t\tsha256=([a-f0-9]{64})/g,
		),
	];
	for (const m of shaHits) {
		const arch = m[1] as "x64" | "arm64";
		const got = m[2]!;
		const key = arch === "x64" ? "linux_x64" : "linux_arm64";
		const expected = pins.betterleaks.sha256[key];
		if (got !== expected) {
			drift.push({
				file: "languages/shared/templates/tools/quality/install-betterleaks.sh",
				detail: `Betterleaks ${key} sha256: expected ${expected}, got ${got}`,
			});
		}
	}

	const osvInstaller = read(
		"languages/shared/templates/tools/quality/install-osv-scanner.sh",
	);
	const osvShaHits = [
		...osvInstaller.matchAll(
			/osv-scanner_linux_(amd64|arm64)"\n\t\tsha256=([a-f0-9]{64})/g,
		),
	];
	for (const m of osvShaHits) {
		const arch = m[1] as "amd64" | "arm64";
		const got = m[2]!;
		const key = arch === "amd64" ? "linux_amd64" : "linux_arm64";
		const expected = pins.osvScanner.sha256[key];
		if (got !== expected) {
			drift.push({
				file: "languages/shared/templates/tools/quality/install-osv-scanner.sh",
				detail: `osv-scanner ${key} sha256: expected ${expected}, got ${got}`,
			});
		}
	}

	return dedupe(drift);
}

function dedupe(drift: PinDrift[]): PinDrift[] {
	const seen = new Set<string>();
	const out: PinDrift[] = [];
	for (const d of drift) {
		const key = `${d.file}\0${d.detail}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(d);
	}
	return out;
}
