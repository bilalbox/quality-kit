import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { desiredState } from "../scripts/desired-state";

function tempTarget(): string {
	return mkdtempSync(join(tmpdir(), "quality-kit-"));
}

const HOST_SHARED_PATHS = [
	".betterleaks.toml",
	".editorconfig",
	".github/actions/quality-gate/action.yml",
	".github/workflows/ci.yml",
	"AGENTS.quality.md",
];

test("collisions: js-ts + dart lists every differing shared path", () => {
	const state = desiredState(tempTarget(), ["js-ts", "dart"]);
	assert.deepEqual(
		state.collisions.map((c) => c.targetRel).sort(),
		HOST_SHARED_PATHS,
	);
	for (const c of state.collisions) {
		assert.deepEqual(c.packs, ["js-ts", "dart"]);
	}
});

test("collisions: js-ts + kotlin-android lists every differing shared path", () => {
	const state = desiredState(tempTarget(), ["js-ts", "kotlin-android"]);
	assert.deepEqual(
		state.collisions.map((c) => c.targetRel).sort(),
		HOST_SHARED_PATHS,
	);
	for (const c of state.collisions) {
		assert.deepEqual(c.packs, ["js-ts", "kotlin-android"]);
	}
});

test("collisions: dart + kotlin-android also collide on gate scripts, hooks, Makefile", () => {
	const state = desiredState(tempTarget(), ["dart", "kotlin-android"]);
	assert.deepEqual(state.collisions.map((c) => c.targetRel).sort(), [
		...HOST_SHARED_PATHS,
		"Makefile",
		"lefthook.yml",
		"tools/quality/gate.sh",
		"tools/quality/lib.sh",
		"tools/quality/run-format.sh",
		"tools/quality/run-secret-scan.sh",
	]);
	for (const c of state.collisions) {
		assert.deepEqual(c.packs, ["dart", "kotlin-android"]);
	}
});

test("collisions: all three Hosts list every Pack placing a path", () => {
	const state = desiredState(tempTarget(), ["kotlin-android", "js-ts", "dart"]);
	assert.deepEqual(
		state.collisions.find((c) => c.targetRel === ".editorconfig")?.packs,
		["kotlin-android", "js-ts", "dart"],
	);
	assert.deepEqual(
		state.collisions.find((c) => c.targetRel === "lefthook.yml")?.packs,
		["kotlin-android", "dart"],
	);
});

test("collisions: identical-content overlap is placed once, not a collision", () => {
	const state = desiredState(tempTarget(), ["dart", "js-ts"]);
	assert.ok(
		!state.collisions.some((c) => c.targetRel === ".betterleaksignore"),
	);
	const placed = state.rootPlacements.filter(
		(p) => p.targetRel === ".betterleaksignore",
	);
	assert.deepEqual(
		placed.map((p) => p.pack),
		["dart"],
	);
});

test("collisions: none for a single Host or Host + Fragment", () => {
	for (const packs of [
		["js-ts"],
		["dart"],
		["kotlin-android"],
		["python"],
		["js-ts", "python"],
	] as const) {
		const state = desiredState(tempTarget(), packs);
		assert.deepEqual(state.collisions, [], packs.join(","));
	}
});
