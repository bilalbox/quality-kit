import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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

test("dart: every package placement has a template file", () => {
	const target = flutterAppAndDartPackage();
	for (const p of desiredState(target, ["dart"]).packagePlacements) {
		assert.ok(
			existsSync(join(packTemplatesRoot("dart"), p.templateRel)),
			`missing template ${p.templateRel}`,
		);
	}
});
