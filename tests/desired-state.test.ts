import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test } from "node:test";
import { desiredState, diffAgainst } from "../scripts/desired-state";
import { packTemplatesRoot } from "../scripts/kit-fs";
import { detectPacks, PACK_IDS } from "../scripts/packs";

function tempTarget(): string {
	return mkdtempSync(join(tmpdir(), "quality-kit-"));
}

test("detectPacks: js-ts needs real dependencies", () => {
	const target = tempTarget();
	writeFileSync(
		join(target, "package.json"),
		JSON.stringify({ name: "x", dependencies: { lodash: "4" } }),
	);
	assert.ok(detectPacks(target).includes("js-ts"));
});

test("detectPacks: Flutter stub package.json is not js-ts", () => {
	const target = tempTarget();
	writeFileSync(join(target, "package.json"), JSON.stringify({ name: "x" }));
	writeFileSync(join(target, "pubspec.yaml"), "name: app\n");
	const packs = detectPacks(target);
	assert.ok(!packs.includes("js-ts"));
	assert.ok(packs.includes("dart"));
});

test("detectPacks: Flutter tool/*.py does not select python", () => {
	const target = tempTarget();
	writeFileSync(join(target, "pubspec.yaml"), "name: app\n");
	mkdirSync(join(target, "tool"));
	writeFileSync(join(target, "tool", "generate.py"), "print(1)\n");
	const packs = detectPacks(target);
	assert.ok(packs.includes("dart"));
	assert.ok(!packs.includes("python"));
});

test("detectPacks: root pyproject.toml selects python", () => {
	const target = tempTarget();
	writeFileSync(join(target, "pyproject.toml"), "[project]\nname = \"x\"\n");
	assert.ok(detectPacks(target).includes("python"));
});

test("detectPacks: product .py outside helper dirs selects python", () => {
	const target = tempTarget();
	mkdirSync(join(target, "src"));
	writeFileSync(join(target, "src", "main.py"), "print(1)\n");
	assert.ok(detectPacks(target).includes("python"));
});

test("detectPacks: root Gradle Android build selects kotlin-android", () => {
	const target = tempTarget();
	writeFileSync(join(target, "settings.gradle.kts"), 'include(":app")\n');
	mkdirSync(join(target, "gradle"));
	writeFileSync(
		join(target, "gradle", "libs.versions.toml"),
		'[plugins]\nandroid-application = { id = "com.android.application", version = "9.5.0" }\n',
	);
	assert.ok(detectPacks(target).includes("kotlin-android"));
});

test("detectPacks: Flutter android/ Gradle build is not kotlin-android", () => {
	const target = tempTarget();
	writeFileSync(join(target, "pubspec.yaml"), "name: app\n");
	mkdirSync(join(target, "android"));
	writeFileSync(join(target, "android", "settings.gradle.kts"), "\n");
	writeFileSync(
		join(target, "android", "build.gradle.kts"),
		'plugins { id("com.android.application") }\n',
	);
	const packs = detectPacks(target);
	assert.ok(packs.includes("dart"));
	assert.ok(!packs.includes("kotlin-android"));
});

test("detectPacks: plain Kotlin/JVM Gradle build is not kotlin-android", () => {
	const target = tempTarget();
	writeFileSync(join(target, "settings.gradle.kts"), "\n");
	writeFileSync(
		join(target, "build.gradle.kts"),
		'plugins { kotlin("jvm") version "2.4.21" }\n',
	);
	assert.ok(!detectPacks(target).includes("kotlin-android"));
});

test("desiredState: kotlin-android places build-logic and executable scripts", () => {
	const target = tempTarget();
	const state = desiredState(target, ["kotlin-android"]);
	assert.equal(state.packageJson, null);
	assert.equal(state.packagePlacements.length, 0);
	assert.ok(
		state.rootPlacements.some(
			(p) => p.targetRel === "build-logic/quality/build.gradle.kts",
		),
	);
	assert.ok(
		state.rootPlacements.find((p) => p.targetRel === "tools/quality/gate.sh")
			?.executable,
	);
});

test("every Pack placement has a template file", () => {
	for (const id of PACK_IDS) {
		const state = desiredState(tempTarget(), [id]);
		for (const p of state.rootPlacements) {
			const src = join(packTemplatesRoot(p.pack), p.templateRel);
			assert.ok(existsSync(src), `${id}: missing template ${p.templateRel}`);
		}
	}
});

test("kotlin-android: every template file is placed", () => {
	const root = packTemplatesRoot("kotlin-android");
	const files = readdirSync(root, { recursive: true, withFileTypes: true })
		.filter((d) => d.isFile())
		.map((d) => relative(root, join(d.parentPath, d.name)));
	const placed = new Set(
		desiredState(tempTarget(), ["kotlin-android"]).rootPlacements.map(
			(p) => p.templateRel,
		),
	);
	assert.deepEqual(
		files.filter((f) => !placed.has(f)),
		[],
	);
});

test("desiredState: js-ts + python composes gate:fast and fragment scripts", () => {
	const target = tempTarget();
	writeFileSync(
		join(target, "package.json"),
		JSON.stringify({ name: "x", dependencies: { lodash: "4" } }),
	);
	writeFileSync(join(target, "main.py"), "print(1)\n");

	const state = desiredState(target, ["js-ts", "python"]);
	assert.ok(state.packageJson);
	assert.ok(state.packageJson!.scripts["lint:py"]);
	assert.ok(state.packageJson!.scripts["gate:fast:py"]);
	assert.match(
		state.packageJson!.scripts["gate:fast"]!,
		/&& pnpm lint:py$/,
	);
	assert.ok(
		state.rootPlacements.some((p) => p.targetRel === "pyproject.toml"),
	);
	assert.ok(state.rootPlacements.some((p) => p.targetRel === "biome.json"));
});

test("desiredState: python alone has files but no packageJson", () => {
	const target = tempTarget();
	const state = desiredState(target, ["python"]);
	assert.equal(state.packageJson, null);
	assert.ok(
		state.rootPlacements.some((p) => p.targetRel === "pyproject.toml"),
	);
});

test("desiredState: dart package placements use resolved roots", () => {
	const target = tempTarget();
	mkdirSync(join(target, "app"));
	writeFileSync(join(target, "app", "pubspec.yaml"), "name: app\n");
	writeFileSync(
		join(target, "quality-kit.dart.json"),
		JSON.stringify({ roots: ["app"] }),
	);

	const state = desiredState(target, ["dart"]);
	assert.ok(
		state.packagePlacements.some(
			(p) => p.targetRel === "app/analysis_options.yaml",
		),
	);
	assert.ok(
		state.rootPlacements.some((p) => p.targetRel === "tools/quality/gate.sh"),
	);
	assert.ok(
		state.rootPlacements.find((p) => p.targetRel === "tools/quality/gate.sh")
			?.executable,
	);
});

test("desiredState: first-wins on overlapping targetRel by pack order", () => {
	const target = tempTarget();
	const dartFirst = desiredState(target, ["dart", "js-ts"]);
	const jsFirst = desiredState(target, ["js-ts", "dart"]);

	const dartEditor = dartFirst.rootPlacements.find(
		(p) => p.targetRel === ".editorconfig",
	);
	const jsEditor = jsFirst.rootPlacements.find(
		(p) => p.targetRel === ".editorconfig",
	);
	assert.equal(dartEditor?.pack, "dart");
	assert.equal(jsEditor?.pack, "js-ts");
});

test("diffAgainst: missing files and scripts", () => {
	const target = tempTarget();
	writeFileSync(
		join(target, "package.json"),
		JSON.stringify({ name: "x", scripts: {} }),
	);

	const state = desiredState(target, ["js-ts"]);
	const report = diffAgainst(target, state);
	assert.ok(report.files.some((f) => f.kind === "missing"));
	assert.ok(report.scripts.some((s) => s.kind === "missing"));
});
