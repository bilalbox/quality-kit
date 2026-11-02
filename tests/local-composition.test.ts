import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { desiredState } from "../scripts/desired-state";
import { kitRoot } from "../scripts/kit-fs";
import {
	composeAgentsQuality,
	composeEditorconfig,
	composeGateSh,
	composeLefthook,
	composeMakefile,
} from "../scripts/packs/local";
import type { PackId } from "../scripts/packs";

function tempTarget(): string {
	return mkdtempSync(join(tmpdir(), "quality-kit-"));
}

function runApply(target: string, packs: string) {
	return spawnSync(
		join(kitRoot, "node_modules", ".bin", "tsx"),
		[
			join(kitRoot, "scripts", "apply.ts"),
			"--target",
			target,
			"--packs",
			packs,
		],
		{ encoding: "utf8" },
	);
}

const HOST_PAIRS: [PackId, PackId][] = [
	["js-ts", "dart"],
	["js-ts", "kotlin-android"],
	["dart", "kotlin-android"],
];

const COMPOSED_PATHS = [
	".editorconfig",
	"AGENTS.quality.md",
	"lefthook.yml",
	"Makefile",
	"tools/quality/gate.sh",
] as const;

test("compose: single bash-gate Host gate.sh dispatches to that Host only", () => {
	for (const pack of ["python", "dart", "kotlin-android"] as const) {
		const sh = composeGateSh([pack]);
		assert.match(sh, new RegExp(`tools/quality/${pack}/gate\\.sh`));
		assert.doesNotMatch(sh, /pnpm gate/);
		for (const other of ["python", "dart", "kotlin-android"] as const) {
			if (other === pack) continue;
			assert.doesNotMatch(sh, new RegExp(`tools/quality/${other}/`));
		}
	}
});

test("compose: dart + kotlin-android gate.sh runs both Host gates", () => {
	const sh = composeGateSh(["dart", "kotlin-android"]);
	assert.match(sh, /tools\/quality\/dart\/gate\.sh/);
	assert.match(sh, /tools\/quality\/kotlin-android\/gate\.sh/);
	assert.match(sh, /\[fast\|full\]/);
});

test("compose: js-ts + dart gate.sh runs pnpm and dart", () => {
	const sh = composeGateSh(["js-ts", "dart"]);
	assert.match(sh, /pnpm gate/);
	assert.match(sh, /tools\/quality\/dart\/gate\.sh/);
});

test("compose: single Host lefthook / editorconfig / Makefile / AGENTS match templates", () => {
	for (const pack of ["python", "dart", "kotlin-android"] as const) {
		assert.equal(
			composeLefthook([pack]),
			readFileSync(
				join(kitRoot, "languages", pack, "templates", "lefthook.yml"),
				"utf8",
			).replace(/\r\n/g, "\n"),
		);
		assert.equal(
			composeEditorconfig([pack]),
			readFileSync(
				join(kitRoot, "languages", pack, "templates", ".editorconfig"),
				"utf8",
			).replace(/\r\n/g, "\n"),
		);
		assert.equal(
			composeMakefile([pack]),
			readFileSync(
				join(kitRoot, "languages", pack, "templates", "Makefile"),
				"utf8",
			).replace(/\r\n/g, "\n"),
		);
		assert.equal(
			composeAgentsQuality([pack]),
			readFileSync(
				join(kitRoot, "languages", pack, "templates", "AGENTS.quality.md"),
				"utf8",
			).replace(/\r\n/g, "\n"),
		);
	}
	assert.equal(
		composeEditorconfig(["js-ts"]),
		readFileSync(
			join(kitRoot, "languages", "js-ts", "templates", ".editorconfig"),
			"utf8",
		).replace(/\r\n/g, "\n"),
	);
	assert.equal(
		composeAgentsQuality(["js-ts"]),
		readFileSync(
			join(kitRoot, "languages", "js-ts", "templates", "AGENTS.quality.md"),
			"utf8",
		).replace(/\r\n/g, "\n"),
	);
});

test("compose: dart + kotlin-android lefthook runs each format and top-level gate", () => {
	const yml = composeLefthook(["dart", "kotlin-android"]);
	assert.match(yml, /run-secret-scan\.sh --staged/);
	assert.match(yml, /tools\/quality\/dart\/run-format\.sh --staged/);
	assert.match(yml, /tools\/quality\/kotlin-android\/run-format\.sh --staged/);
	assert.match(yml, /tools\/quality\/gate\.sh full/);
	assert.equal((yml.match(/run-secret-scan/g) ?? []).length, 1);
});

for (const packs of [
	["dart"],
	["kotlin-android"],
	["js-ts"],
	...HOST_PAIRS,
	["js-ts", "dart", "kotlin-android"],
] as PackId[][]) {
	test(`desiredState: [${packs.join(", ")}] has no collisions and namespaced Host scripts`, () => {
		const state = desiredState(tempTarget(), packs);
		assert.deepEqual(state.collisions, [], packs.join("+"));
		for (const pack of packs) {
			if (pack === "js-ts") continue;
			assert.ok(
				state.rootPlacements.some(
					(p) => p.targetRel === `tools/quality/${pack}/gate.sh`,
				),
				`${pack} namespaced gate`,
			);
			assert.ok(
				!state.rootPlacements.some(
					(p) =>
						p.targetRel === "tools/quality/lib.sh" ||
						(p.targetRel === "tools/quality/gate.sh" && p.content === undefined),
				),
			);
		}
		if (packs.some((p) => p === "dart" || p === "kotlin-android")) {
			const gate = state.rootPlacements.find(
				(p) => p.targetRel === "tools/quality/gate.sh",
			);
			assert.ok(gate?.content, "composed top-level gate");
			assert.equal(gate.executable, true);
			assert.equal(gate.content, composeGateSh(packs));
		}
	});
}

test("desiredState: Host pairs place one composed copy of each shared root file", () => {
	for (const packs of HOST_PAIRS) {
		const state = desiredState(tempTarget(), packs);
		for (const path of COMPOSED_PATHS) {
			if (path === "lefthook.yml" || path === "Makefile" || path === "tools/quality/gate.sh") {
				if (!packs.some((p) => p === "dart" || p === "kotlin-android")) continue;
			}
			const hits = state.rootPlacements.filter((p) => p.targetRel === path);
			assert.equal(hits.length, 1, `${packs.join("+")} ${path}`);
			assert.ok(hits[0]!.content !== undefined, `${path} generated`);
		}
	}
});

test("apply: dart,kotlin-android writes both Host gates and composed entrypoints", () => {
	const target = tempTarget();
	const res = runApply(target, "dart,kotlin-android");
	assert.equal(res.status, 0, `${res.stdout}${res.stderr}`);
	assert.ok(existsSync(join(target, "tools/quality/dart/gate.sh")));
	assert.ok(existsSync(join(target, "tools/quality/kotlin-android/gate.sh")));
	assert.ok(existsSync(join(target, "tools/quality/gate.sh")));
	assert.ok(existsSync(join(target, "lefthook.yml")));
	assert.ok(existsSync(join(target, ".editorconfig")));
	assert.ok(existsSync(join(target, "Makefile")));
	assert.ok(existsSync(join(target, "AGENTS.quality.md")));
	const gate = readFileSync(join(target, "tools/quality/gate.sh"), "utf8");
	assert.match(gate, /dart\/gate\.sh/);
	assert.match(gate, /kotlin-android\/gate\.sh/);
	assert.equal(
		statSync(join(target, "tools/quality/gate.sh")).mode & 0o111,
		0o111,
	);
	assert.deepEqual(
		readdirSync(join(target, "tools/quality")).sort(),
		[
			"check-baseline-growth.sh",
			"dart",
			"gate.sh",
			"install-betterleaks.sh",
			"install-osv-scanner.sh",
			"kotlin-android",
			"run-secret-scan.sh",
			"run-vuln-scan.sh",
		].sort(),
	);
});
