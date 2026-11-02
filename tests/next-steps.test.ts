import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { desiredState } from "../scripts/desired-state";
import { kitRoot } from "../scripts/kit-fs";
import { PACK_IDS, PACKS } from "../scripts/packs";

function tempTarget(): string {
	return mkdtempSync(join(tmpdir(), "quality-kit-"));
}

function stepsFor(packs: Parameters<typeof desiredState>[1]) {
	return desiredState(tempTarget(), packs).nextSteps;
}

test("nextSteps: one entry per selected Pack, in selection order", () => {
	assert.deepEqual(
		stepsFor(["js-ts", "python"]).map((n) => n.pack),
		["js-ts", "python"],
	);
});

test("nextSteps: js-ts tells the user to install Betterleaks", () => {
	const [jsTs] = stepsFor(["js-ts"]);
	assert.ok(jsTs?.steps.some((s) => /install betterleaks/i.test(s)));
});

test("nextSteps: kotlin-android wires gate targets into an existing Makefile", () => {
	const [kotlin] = stepsFor(["kotlin-android"]);
	assert.ok(
		kotlin?.steps.some((s) => /Makefile/.test(s) && /gate-fast/.test(s)),
	);
});

test("every Host Pack with templates declares next steps", () => {
	const target = tempTarget();
	for (const id of PACK_IDS) {
		const pack = PACKS[id];
		if (pack.kind !== "host") continue;
		const contrib = pack.contribute(target, [id]);
		if (contrib.rootPlacements.length === 0) continue;
		assert.ok(contrib.nextSteps.length > 0, `${id} declares no next steps`);
	}
});

function applyNextOutput(packs: string, target = tempTarget()): string[] {
	const result = spawnSync(
		process.execPath,
		["--import", "tsx", "scripts/apply.ts", "--target", target, "--packs", packs],
		{ cwd: kitRoot, encoding: "utf8" },
	);
	assert.equal(result.status, 0, result.stderr);
	const out = result.stdout.split("\n");
	return out.slice(out.findIndex((l) => l.startsWith("Next")));
}

test("apply: prints each selected Pack's declared steps, nothing else", () => {
	const target = tempTarget();
	writeFileSync(join(target, "package.json"), JSON.stringify({ name: "x" }));
	const packs = ["js-ts", "python"] as const;

	const expected = stepsFor([...packs]).flatMap(({ pack, steps }) => [
		`Next (see languages/${pack}/MODULE.md):`,
		...steps.map((s, i) => `  ${i + 1}. ${s}`),
		"",
	]);
	assert.deepEqual(applyNextOutput(packs.join(","), target), expected);
});
