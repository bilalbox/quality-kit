import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { desiredState } from "../scripts/desired-state";
import { languagesRoot } from "../scripts/kit-fs";
import type { PackId } from "../scripts/packs";

const COMPARE = join(
	languagesRoot,
	"shared/templates/tools/quality/ratchets/compare.py",
);
const FIXTURES = join(
	languagesRoot,
	"shared/templates/tools/quality/ratchets/fixtures",
);

const HOSTS = [
	"js-ts",
	"python",
	"dart",
	"kotlin-android",
] as const satisfies PackId[];

function compare(
	baseline: string,
	findings: string,
	extra: string[] = [],
	env?: NodeJS.ProcessEnv,
) {
	const res = spawnSync(
		"python3",
		[COMPARE, "--baseline", baseline, "--findings", findings, ...extra],
		{ encoding: "utf8", env: { ...process.env, ...env } },
	);
	return { status: res.status ?? 1, output: `${res.stdout}${res.stderr}` };
}

test("coverage-ratchet: shared compare enforces raise-only coverage scores", () => {
	const drop = compare(
		join(FIXTURES, "baseline-coverage.json"),
		join(FIXTURES, "findings-coverage-drop.json"),
	);
	assert.equal(drop.status, 1, drop.output);
	assert.match(drop.output, /Score regressions/);

	const ok = compare(
		join(FIXTURES, "baseline-coverage.json"),
		join(FIXTURES, "findings-coverage-ok.json"),
	);
	assert.equal(ok.status, 0, ok.output);
});

test("coverage-ratchet: empty baseline enforces floor only", () => {
	const below = compare(
		join(FIXTURES, "baseline-coverage-empty.json"),
		join(FIXTURES, "findings-coverage-below-floor.json"),
	);
	assert.equal(below.status, 1, below.output);
	assert.match(below.output, /floor/i);

	const dir = mkdtempSync(join(tmpdir(), "qk-cov-floor-"));
	const findings = join(dir, "findings.json");
	writeFileSync(
		findings,
		`${JSON.stringify({ findings: [{ id: ".", score: 88 }] }, null, "\t")}\n`,
	);
	const ok = compare(join(FIXTURES, "baseline-coverage-empty.json"), findings);
	assert.equal(ok.status, 0, ok.output);
});

for (const host of HOSTS) {
	test(`coverage-ratchet: ${host} Desired state places shared ratchet + Host collector`, () => {
		const state = desiredState(mkdtempSync(join(tmpdir(), "qk-cov-")), [host]);
		const rels = new Set(state.rootPlacements.map((p) => p.targetRel));
		assert.ok(rels.has("baselines/coverage.json"), "coverage baseline");
		assert.ok(rels.has("tools/quality/run-coverage-ratchet.sh"), "runner");
		assert.ok(rels.has("tools/quality/ratchets/compare.py"), "compare");
		assert.ok(
			rels.has(`tools/quality/${host}/collect-coverage.sh`),
			"Host collector beside namespaced gate scripts",
		);
	});
}

test("coverage-ratchet: shared runner globs tools/quality/*/collect-coverage.sh", () => {
	const runner = join(
		languagesRoot,
		"shared/templates/tools/quality/run-coverage-ratchet.sh",
	);
	const text = spawnSync("bash", ["-c", `sed -n '1,20p' "${runner}"`], {
		encoding: "utf8",
	}).stdout;
	assert.match(text, /tools\/quality\/\*\/collect-coverage\.sh/);
});
