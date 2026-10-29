import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { desiredState, diffAgainst } from "../scripts/desired-state";
import { detectPacks } from "../scripts/packs";

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
