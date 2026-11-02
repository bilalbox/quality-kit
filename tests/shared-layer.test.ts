import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { desiredState } from "../scripts/desired-state";
import { kitRoot, languagesRoot, templatePath } from "../scripts/kit-fs";
import type { PackId } from "../scripts/packs";

function tempTarget(): string {
	return mkdtempSync(join(tmpdir(), "quality-kit-"));
}

const HOSTS = ["js-ts", "dart", "kotlin-android"] as const satisfies PackId[];

const SECRETS_FILES = [
	".betterleaks.toml",
	".betterleaksignore",
	".github/actions/setup-betterleaks/action.yml",
	"tools/quality/install-betterleaks.sh",
	"tools/quality/run-secret-scan.sh",
];

for (const host of HOSTS) {
	test(`shared layer: ${host} places the secrets files from the shared layer`, () => {
		const state = desiredState(tempTarget(), [host]);
		for (const rel of SECRETS_FILES) {
			const placed = state.rootPlacements.filter((p) => p.targetRel === rel);
			assert.equal(placed.length, 1, rel);
			assert.equal(
				templatePath(placed[0]!),
				join(languagesRoot, "shared", "templates", rel),
			);
		}
	});
}

for (const packs of [
	["js-ts", "dart"],
	["dart", "kotlin-android"],
	["kotlin-android", "js-ts", "dart"],
] as const) {
	test(`shared layer: ${packs.join(" + ")} places the shared files once, without collisions`, () => {
		const state = desiredState(tempTarget(), packs);
		for (const rel of SECRETS_FILES) {
			assert.equal(
				state.rootPlacements.filter((p) => p.targetRel === rel).length,
				1,
				rel,
			);
		}
		const collided = state.collisions.map((c) => c.targetRel);
		assert.deepEqual(
			collided.filter((rel) => SECRETS_FILES.includes(rel)),
			[],
		);
	});
}

test("shared layer: every Host keeps its own allowlist file alongside the others", () => {
	const state = desiredState(tempTarget(), ["js-ts", "dart", "kotlin-android"]);
	assert.deepEqual(
		state.rootPlacements
			.filter((p) => p.targetRel.startsWith(".betterleaks.d/"))
			.map((p) => p.targetRel),
		[
			".betterleaks.d/js-ts.toml",
			".betterleaks.d/dart.toml",
			".betterleaks.d/kotlin-android.toml",
		],
	);
});

function runKit(script: "apply" | "audit", target: string, packs: string) {
	const res = spawnSync(
		process.execPath,
		["--import", "tsx", `scripts/${script}.ts`, "--target", target, "--packs", packs],
		{ cwd: kitRoot, encoding: "utf8" },
	);
	return { status: res.status, output: res.stdout + res.stderr };
}

test("apply + audit: shared files are labelled with the shared layer, not a Host", () => {
	const target = tempTarget();
	const applied = runKit("apply", target, "kotlin-android");
	assert.match(applied.output, /copied +\[shared\] \.betterleaks\.toml/);
	assert.match(applied.output, /copied +\[kotlin-android\] \.betterleaks\.d\/kotlin-android\.toml/);

	appendFileSync(join(target, ".betterleaks.toml"), "# local edit\n");
	const audited = runKit("audit", target, "kotlin-android");
	assert.match(audited.output, /drift +\[shared\] \.betterleaks\.toml/);
});

test("shared layer: a Fragment Pack alone does not compose it", () => {
	const state = desiredState(tempTarget(), ["python"]);
	assert.ok(!state.rootPlacements.some((p) => p.shared));
});
