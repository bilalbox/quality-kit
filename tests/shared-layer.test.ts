import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { desiredState } from "../scripts/desired-state";
import {
	kitRoot,
	languagesRoot,
	placementContent,
	templatePath,
} from "../scripts/kit-fs";
import type { PackId } from "../scripts/packs";

function tempTarget(): string {
	return mkdtempSync(join(tmpdir(), "quality-kit-"));
}

const HOSTS = ["js-ts", "python", "dart", "kotlin-android"] as const satisfies PackId[];

const SHARED_FILES = [
	".betterleaks.toml",
	".betterleaksignore",
	".github/actions/setup-betterleaks/action.yml",
	".github/actions/setup-osv-scanner/action.yml",
	"osv-scanner.toml",
	"tools/quality/install-betterleaks.sh",
	"tools/quality/install-osv-scanner.sh",
	"tools/quality/run-secret-scan.sh",
	"tools/quality/run-vuln-scan.sh",
];

for (const host of HOSTS) {
	test(`shared layer: ${host} places the shared-layer files from languages/shared`, () => {
		const state = desiredState(tempTarget(), [host]);
		for (const rel of SHARED_FILES) {
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
		for (const rel of SHARED_FILES) {
			assert.equal(
				state.rootPlacements.filter((p) => p.targetRel === rel).length,
				1,
				rel,
			);
		}
		const collided = state.collisions.map((c) => c.targetRel);
		assert.deepEqual(
			collided.filter((rel) => SHARED_FILES.includes(rel)),
			[],
		);
	});
}

test("shared layer: every Host keeps its own allowlist file alongside the others", () => {
	const withJs = desiredState(tempTarget(), ["js-ts", "dart", "kotlin-android"]);
	assert.deepEqual(
		withJs.rootPlacements
			.filter((p) => p.targetRel.startsWith(".betterleaks.d/"))
			.map((p) => p.targetRel),
		[
			".betterleaks.d/js-ts.toml",
			".betterleaks.d/dart.toml",
			".betterleaks.d/kotlin-android.toml",
		],
	);
	// python is Host only without js-ts; Fragment mode skips its allowlist.
	const withPy = desiredState(tempTarget(), ["python", "dart", "kotlin-android"]);
	assert.deepEqual(
		withPy.rootPlacements
			.filter((p) => p.targetRel.startsWith(".betterleaks.d/"))
			.map((p) => p.targetRel),
		[
			".betterleaks.d/python.toml",
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
	assert.match(audited.output, /customized +\[shared\] \.betterleaks\.toml/);
});

test("shared layer: Pack allowlists hold only array tables, so appending them is safe", () => {
	const state = desiredState(tempTarget(), ["js-ts", "dart", "kotlin-android"]);
	for (const p of state.rootPlacements) {
		if (!p.targetRel.startsWith(".betterleaks.d/")) continue;
		const lines = readFileSync(templatePath(p), "utf8")
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l !== "" && !l.startsWith("#"));
		assert.match(lines[0] ?? "", /^\[\[(allowlists|rules)\]\]$/, p.targetRel);
		assert.deepEqual(
			lines.filter((l) => /^\[[^[]/.test(l)),
			[],
			`${p.targetRel}: single [table] headers would clash with the shared config`,
		);
	}
});

for (const host of HOSTS) {
	test(`shared layer: ${host} CI installs Betterleaks only through the shared action`, () => {
		const state = desiredState(tempTarget(), [host]);
		const ci = state.rootPlacements.find(
			(p) => p.targetRel === ".github/workflows/ci.yml",
		);
		assert.match(
			placementContent(ci!) ?? "",
			/uses: \.\/\.github\/actions\/setup-betterleaks\n/,
		);
		const ownDownloads = state.rootPlacements.filter(
			(p) =>
				!p.shared &&
				(placementContent(p) ?? "").includes("betterleaks/releases/download"),
		);
		assert.deepEqual(
			ownDownloads.map((p) => p.targetRel),
			[],
		);
	});

	test(`shared layer: ${host} CI checks out full history for the PR base-ref scan`, () => {
		const state = desiredState(tempTarget(), [host]);
		const ci = state.rootPlacements.find(
			(p) => p.targetRel === ".github/workflows/ci.yml",
		);
		assert.match(
			readFileSync(templatePath(ci!), "utf8"),
			/fetch-depth:\s*0/,
		);
	});
}

test("shared layer: python Host composes it; Fragment onto js-ts does not (from python)", () => {
	const host = desiredState(tempTarget(), ["python"]);
	assert.ok(host.rootPlacements.some((p) => p.shared && p.pack === "python"));

	const target = tempTarget();
	writeFileSync(
		join(target, "package.json"),
		JSON.stringify({ name: "x", dependencies: { lodash: "4" } }),
	);
	const frag = desiredState(target, ["js-ts", "python"]);
	assert.ok(frag.rootPlacements.some((p) => p.shared));
	assert.ok(!frag.rootPlacements.some((p) => p.shared && p.pack === "python"));
});
