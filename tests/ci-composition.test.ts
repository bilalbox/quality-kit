import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { desiredState, diffAgainst } from "../scripts/desired-state";
import { contentHash, packTemplatesRoot } from "../scripts/kit-fs";
import { composeCiWorkflow } from "../scripts/packs/ci";
import type { PackId } from "../scripts/packs";
import { LOCK_FILE } from "../scripts/lock-file";

function tempTarget(): string {
	return mkdtempSync(join(tmpdir(), "quality-kit-"));
}

function hostCi(pack: PackId): string {
	return readFileSync(
		join(packTemplatesRoot(pack), ".github/workflows/ci.yml"),
		"utf8",
	);
}

const HOST_PAIRS: [PackId, PackId][] = [
	["js-ts", "dart"],
	["js-ts", "kotlin-android"],
	["dart", "kotlin-android"],
	["python", "dart"],
];

const GATE = (pack: PackId) =>
	`.github/actions/${pack}-quality-gate/action.yml`;

test("compose: single Host workflow matches that Host's template", () => {
	for (const pack of ["js-ts", "python", "dart", "kotlin-android"] as const) {
		assert.equal(composeCiWorkflow([pack]), hostCi(pack));
	}
});

for (const [a, b] of HOST_PAIRS) {
	test(`compose: ${a} + ${b} is one workflow with both Hosts' gates`, () => {
		const yml = composeCiWorkflow([a, b]);
		assert.match(yml, /^name: CI$/m);
		assert.match(yml, new RegExp(`^  ${a}:`, "m"));
		assert.match(yml, new RegExp(`^  ${b}:`, "m"));
		assert.doesNotMatch(yml, /^  ci:/m);
		assert.match(yml, new RegExp(`uses: \\./\\.github/actions/${a}-quality-gate`));
		assert.match(yml, new RegExp(`uses: \\./\\.github/actions/${b}-quality-gate`));
		assert.equal(
			(yml.match(/setup-betterleaks/g) ?? []).length,
			2,
			"each Host job keeps its own setup-betterleaks step",
		);
	});
}

test("compose: all three Hosts get one job each", () => {
	const yml = composeCiWorkflow(["kotlin-android", "js-ts", "dart"]);
	for (const pack of ["kotlin-android", "js-ts", "dart"] as const) {
		assert.match(yml, new RegExp(`^  ${pack}:`, "m"));
		assert.match(
			yml,
			new RegExp(`uses: \\./\\.github/actions/${pack}-quality-gate`),
		);
	}
});

for (const packs of [
	["js-ts"],
	["dart"],
	["kotlin-android"],
	...HOST_PAIRS,
	["js-ts", "dart", "kotlin-android"],
] as PackId[][]) {
	test(`desiredState: [${packs.join(", ")}] places composed ci.yml and namespaced gates`, () => {
		const state = desiredState(tempTarget(), packs);
		const ci = state.rootPlacements.find(
			(p) => p.targetRel === ".github/workflows/ci.yml",
		);
		assert.ok(ci, "ci.yml placement");
		assert.equal(ci.kind, "owned");
		assert.equal(ci.content, composeCiWorkflow(packs.filter((id) =>
			["js-ts", "python", "dart", "kotlin-android"].includes(id),
		) as PackId[]));
		assert.equal(
			state.rootPlacements.filter((p) => p.targetRel === ".github/workflows/ci.yml")
				.length,
			1,
		);
		for (const pack of packs) {
			if (!["js-ts", "python", "dart", "kotlin-android"].includes(pack)) continue;
			assert.ok(
				state.rootPlacements.some((p) => p.targetRel === GATE(pack)),
				GATE(pack),
			);
			assert.ok(
				!state.rootPlacements.some(
					(p) => p.targetRel === ".github/actions/quality-gate/action.yml",
				),
			);
		}
	});
}

test("desiredState: Host pairs no longer collide on CI paths", () => {
	for (const packs of HOST_PAIRS) {
		const collided = desiredState(tempTarget(), packs).collisions.map(
			(c) => c.targetRel,
		);
		assert.ok(!collided.includes(".github/workflows/ci.yml"), packs.join("+"));
		assert.ok(
			!collided.includes(".github/actions/quality-gate/action.yml"),
			packs.join("+"),
		);
	}
});

test("audit: composed ci.yml drift is reported like any owned Placement", () => {
	const target = tempTarget();
	const packs: PackId[] = ["js-ts", "dart"];
	const state = desiredState(target, packs);
	const ci = state.rootPlacements.find(
		(p) => p.targetRel === ".github/workflows/ci.yml",
	)!;
	assert.ok(ci.content);

	mkdirSync(dirname(join(target, ci.targetRel)), { recursive: true });
	writeFileSync(join(target, ci.targetRel), ci.content);
	writeFileSync(
		join(target, LOCK_FILE),
		`${JSON.stringify({
			version: 1,
			kitRevision: null,
			files: { [ci.targetRel]: contentHash(ci.content) },
		}, null, "\t")}\n`,
	);

	assert.equal(
		diffAgainst(target, state).files.find((f) => f.path === ci.targetRel)
			?.status,
		"current",
	);

	writeFileSync(join(target, ci.targetRel), `${ci.content}\n# edited\n`);
	assert.equal(
		diffAgainst(target, state).files.find((f) => f.path === ci.targetRel)
			?.status,
		"customized",
	);
});
