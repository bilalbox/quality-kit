import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { desiredState } from "../scripts/desired-state";
import { packTemplatesRoot, readText } from "../scripts/kit-fs";

function tempTarget(): string {
	return mkdtempSync(join(tmpdir(), "quality-kit-"));
}

const FLUTTER_PUBSPEC = `name: app
environment:
  sdk: ^3.9.0
dependencies:
  flutter:
    sdk: flutter
dev_dependencies:
  flutter_lints: ^6.0.0
flutter:
  uses-material-design: true
`;

const PURE_DART_PUBSPEC = `name: core
environment:
  sdk: ^3.9.0
dev_dependencies:
  lints: ^6.0.0
  test: ^1.25.0
`;

function flutterAppAndDartPackage(): string {
	const target = tempTarget();
	mkdirSync(join(target, "app"));
	writeFileSync(join(target, "app", "pubspec.yaml"), FLUTTER_PUBSPEC);
	mkdirSync(join(target, "packages", "core"), { recursive: true });
	writeFileSync(
		join(target, "packages", "core", "pubspec.yaml"),
		PURE_DART_PUBSPEC,
	);
	writeFileSync(
		join(target, "quality-kit.dart.json"),
		JSON.stringify({ roots: ["app", "packages/core"] }),
	);
	return target;
}

function analysisTemplateFor(target: string, root: string): string {
	const placement = desiredState(target, ["dart"]).packagePlacements.find(
		(p) => p.targetRel === join(root, "analysis_options.yaml"),
	);
	assert.ok(placement, `no analysis_options.yaml placement for ${root}`);
	return placement.templateRel;
}

test("dart: pure Dart package root gets the analysis config without Flutter", () => {
	const target = flutterAppAndDartPackage();
	assert.equal(
		analysisTemplateFor(target, "packages/core"),
		"package/dart/analysis_options.yaml",
	);
});

test("dart: Flutter app root gets the Flutter analysis config", () => {
	const target = flutterAppAndDartPackage();
	assert.equal(
		analysisTemplateFor(target, "app"),
		"package/flutter/analysis_options.yaml",
	);
});

test("dart: every analysis config turns on the analyzer strict modes", () => {
	for (const variant of ["flutter", "dart"]) {
		const yaml = readText(
			join(packTemplatesRoot("dart"), "package", variant, "analysis_options.yaml"),
		);
		for (const mode of ["strict-casts", "strict-inference", "strict-raw-types"]) {
			assert.match(
				yaml,
				new RegExp(`^\\s+${mode}: true$`, "m"),
				`${variant}: ${mode} not enabled`,
			);
		}
	}
});

test("dart: pure Dart analysis config does not depend on flutter_lints", () => {
	const yaml = readText(
		join(packTemplatesRoot("dart"), "package", "dart", "analysis_options.yaml"),
	);
	assert.doesNotMatch(yaml, /flutter_lints/);
});

/** PATH dir with only the binaries lib.sh needs — notably no python3. */
function pathWithoutPython(): string {
	const bin = mkdtempSync(join(tmpdir(), "quality-kit-bin-"));
	for (const tool of ["bash", "dirname", "basename", "sort", "grep"]) {
		const found = spawnSync("bash", ["-c", `command -v ${tool}`], {
			encoding: "utf8",
		}).stdout.trim();
		assert.ok(found, `${tool} not found on host`);
		symlinkSync(found, join(bin, tool));
	}
	return bin;
}

function runLib(target: string, fn: string): string {
	const libDir = join(target, "tools", "quality");
	mkdirSync(libDir, { recursive: true });
	copyFileSync(
		join(packTemplatesRoot("dart"), "tools", "quality", "lib.sh"),
		join(libDir, "lib.sh"),
	);
	const bin = pathWithoutPython();
	const result = spawnSync(
		join(bin, "bash"),
		["-c", `command -v python3 && exit 99; source tools/quality/lib.sh && ${fn}`],
		{ cwd: target, encoding: "utf8", env: { PATH: bin, HOME: target } },
	);
	assert.equal(result.status, 0, result.stderr + result.stdout);
	return result.stdout;
}

test("dart lib.sh: configured roots are honoured without python3", () => {
	const target = flutterAppAndDartPackage();
	writeFileSync(
		join(target, "quality-kit.dart.json"),
		'{\n\t"roots": [\n\t\t"packages/core",\n\t\t"app"\n\t],\n\t"flutterEnv": "tools/flutter-env.sh"\n}\n',
	);
	assert.equal(runLib(target, "quality_dart_roots"), "packages/core\napp\n");
});

test("dart lib.sh: flutterEnv is honoured without python3", () => {
	const target = flutterAppAndDartPackage();
	writeFileSync(
		join(target, "quality-kit.dart.json"),
		'{ "roots": ["app"], "flutterEnv": "tools/flutter-env.sh" }\n',
	);
	assert.equal(runLib(target, "quality_flutter_env"), "tools/flutter-env.sh\n");
});

test("dart: CI pins an exact Flutter version that MODULE.md documents", () => {
	const action = readText(
		join(
			packTemplatesRoot("dart"),
			".github",
			"actions",
			"setup-flutter",
			"action.yml",
		),
	);
	const pin = action.match(/^\s+flutter-version: (\d+\.\d+\.\d+)$/m)?.[1];
	assert.ok(pin, "setup-flutter does not pin flutter-version");
	const moduleDoc = readText(join(packTemplatesRoot("dart"), "..", "MODULE.md"));
	assert.match(moduleDoc, new RegExp(`^\\| Flutter \\| ${pin.replaceAll(".", "\\.")}\\b`, "m"));
});

test("dart: every package placement has a template file", () => {
	const target = flutterAppAndDartPackage();
	for (const p of desiredState(target, ["dart"]).packagePlacements) {
		assert.ok(
			existsSync(join(packTemplatesRoot("dart"), p.templateRel)),
			`missing template ${p.templateRel}`,
		);
	}
});
