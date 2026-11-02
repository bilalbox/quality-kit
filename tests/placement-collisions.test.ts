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

/** After #9, no Host pair collides; the guard is only a safety net. */
const HOST_SELECTIONS = [
	["js-ts", "dart"],
	["js-ts", "kotlin-android"],
	["dart", "kotlin-android"],
	["kotlin-android", "js-ts", "dart"],
] as const;

for (const packs of HOST_SELECTIONS) {
	test(`collisions: none for ${packs.join(" + ")}`, () => {
		const state = desiredState(tempTarget(), [...packs]);
		assert.deepEqual(state.collisions, []);
	});
}

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

for (const packs of [
	"js-ts,dart",
	"dart,kotlin-android",
	"js-ts,kotlin-android",
]) {
	test(`apply: --packs ${packs} succeeds (no collisions)`, () => {
		const target = tempTarget();
		writeFileSync(join(target, "package.json"), "{}\n");
		const { status, output } = runCli("apply", target, packs);
		assert.equal(status, 0, output);
		assert.doesNotMatch(output, /Refusing/);
	});

	test(`audit: --packs ${packs} does not refuse for collisions`, () => {
		const { status, output } = runCli("audit", tempTarget(), packs);
		assert.notEqual(status, 2, output);
		assert.doesNotMatch(output, /Refusing/);
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
	assert.match(audited.output, /- current: \d+/);
});
