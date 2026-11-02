import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { desiredState } from "../scripts/desired-state";
import { kitRoot } from "../scripts/kit-fs";

function tempTarget(): string {
	return mkdtempSync(join(tmpdir(), "quality-kit-"));
}

function runCli(
	script: "apply" | "audit",
	target: string,
	packs: string,
): { status: number | null; output: string } {
	const res = spawnSync(
		join(kitRoot, "node_modules", ".bin", "tsx"),
		[
			join(kitRoot, "scripts", `${script}.ts`),
			"--target",
			target,
			"--packs",
			packs,
		],
		{ encoding: "utf8" },
	);
	return { status: res.status, output: `${res.stdout}${res.stderr}` };
}

const HOST_SHARED_PATHS = [
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

function assertListsCollisions(output: string, packs: string): void {
	for (const path of HOST_SHARED_PATHS) {
		assert.ok(
			output.includes(`  ${path}  (${packs.replace(",", ", ")})`),
			`${path} not listed in:\n${output}`,
		);
	}
}

for (const packs of [
	"js-ts,dart",
	"dart,kotlin-android",
	"js-ts,kotlin-android",
]) {
	test(`apply: --packs ${packs} refuses, lists collisions, writes nothing`, () => {
		const target = tempTarget();
		writeFileSync(join(target, "package.json"), "{}\n");
		const { status, output } = runCli("apply", target, packs);
		assert.equal(status, 2);
		assertListsCollisions(output, packs);
		assert.deepEqual(readdirSync(target), ["package.json"]);
	});

	test(`audit: --packs ${packs} refuses and lists collisions`, () => {
		const { status, output } = runCli("audit", tempTarget(), packs);
		assert.equal(status, 2);
		assertListsCollisions(output, packs);
	});
}

test("apply + audit: js-ts + python still apply cleanly", () => {
	const target = tempTarget();
	writeFileSync(join(target, "package.json"), "{}\n");
	const applied = runCli("apply", target, "js-ts,python");
	assert.equal(applied.status, 0, applied.output);
	assert.ok(readdirSync(target).includes("biome.json"));
	assert.ok(readdirSync(target).includes("pyproject.toml"));
	const audited = runCli("audit", target, "js-ts,python");
	assert.doesNotMatch(audited.output, /Refusing/);
	assert.match(audited.output, /- match: \d+/);
});
