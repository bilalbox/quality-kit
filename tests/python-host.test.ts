/**
 * #17: python Host vs Fragment — Desired state, composition, lint:py once.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { desiredState } from "../scripts/desired-state";
import { PACKS } from "../scripts/packs";
import { composeCiWorkflow } from "../scripts/packs/ci";
import { composeGateSh, composeLefthook } from "../scripts/packs/local";
import { HOST_SMOKES } from "../scripts/smoke/index";
import { effectiveKind } from "../scripts/packs/effective-kind";

function tempTarget(): string {
	return mkdtempSync(join(tmpdir(), "quality-kit-"));
}

test("python effectiveKind: Host alone, Fragment onto js-ts", () => {
	assert.equal(effectiveKind("python", ["python"]), "host");
	assert.equal(effectiveKind("python", ["js-ts", "python"]), "fragment");
	assert.equal(effectiveKind("python", ["python", "dart"]), "host");
	assert.equal(PACKS.python.kind, "host");
});

test("desiredState: python Host places shared layer, gate, lefthook, CI", () => {
	const state = desiredState(tempTarget(), ["python"]);
	assert.equal(state.packageJson, null);
	assert.ok(state.rootPlacements.some((p) => p.shared));
	assert.ok(
		state.rootPlacements.some((p) => p.targetRel === "tools/quality/python/gate.sh"),
	);
	assert.ok(
		state.rootPlacements.some(
			(p) => p.targetRel === "tools/quality/python/collect-coverage.sh",
		),
	);
	assert.ok(
		state.rootPlacements.some((p) => p.targetRel === "baselines/coverage.json"),
	);
	assert.ok(
		state.rootPlacements.some((p) => p.targetRel === "tools/quality/gate.sh"),
	);
	assert.ok(state.rootPlacements.some((p) => p.targetRel === "lefthook.yml"));
	assert.ok(
		state.rootPlacements.some((p) => p.targetRel === ".github/workflows/ci.yml"),
	);
	assert.ok(
		state.rootPlacements.some(
			(p) => p.targetRel === ".github/actions/python-quality-gate/action.yml",
		),
	);
	assert.ok(
		state.rootPlacements.some((p) => p.targetRel === ".betterleaks.d/python.toml"),
	);
	assert.ok(state.probes.some((p) => p.pack === "python"));
	assert.equal(composeGateSh(["python"]), state.rootPlacements.find(
		(p) => p.targetRel === "tools/quality/gate.sh",
	)?.content);
	assert.match(composeLefthook(["python"]), /tools\/quality\/python\/run-format/);
	assert.match(composeCiWorkflow(["python"]), /python-quality-gate/);
});

test("desiredState: js-ts + python stays Fragment; lint:py once", () => {
	const target = tempTarget();
	writeFileSync(
		join(target, "package.json"),
		JSON.stringify({ name: "x", dependencies: { lodash: "4" } }),
	);
	writeFileSync(join(target, "main.py"), "print(1)\n");

	const state = desiredState(target, ["js-ts", "python"]);
	assert.ok(state.packageJson);
	const scripts = state.packageJson!.scripts;
	assert.ok(scripts["lint:py"]);
	assert.equal(scripts["gate:fast:py"], "pnpm lint:py");
	assert.match(
		scripts["gate:fast"]!,
		/tools\/quality\/js-ts\/gate\.sh fast lint:py$/,
	);
	assert.equal(
		(scripts["gate:fast"]!.match(/lint:py/g) ?? []).length,
		1,
		"gate:fast must pass lint:py once as a Host-gate step arg",
	);
	assert.doesNotMatch(scripts["gate:fast"]!, /&&\s*pnpm\s+lint:py/);
	assert.equal(
		(scripts["gate:fast:py"]!.match(/lint:py/g) ?? []).length,
		1,
		"gate:fast:py must not re-run gate:fast (would double lint:py)",
	);
	assert.ok(!state.rootPlacements.some((p) => p.targetRel === "lefthook.yml"));
	assert.ok(
		!state.rootPlacements.some((p) => p.targetRel === "tools/quality/python/gate.sh"),
	);
	assert.ok(
		!state.rootPlacements.some((p) => p.shared && p.pack === "python"),
	);
	assert.equal(state.probes.filter((p) => p.pack === "python").length, 0);
});

test("smoke registry: python Host has a HostSmoke", () => {
	assert.ok(HOST_SMOKES.python);
	assert.ok(HOST_SMOKES.python!.tools.includes("uv"));
});
