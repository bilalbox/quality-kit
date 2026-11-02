import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { desiredState, diffAgainst } from "../scripts/desired-state";
import { kitRoot, packTemplatesRoot } from "../scripts/kit-fs";
import { PACK_IDS, type PackId } from "../scripts/packs";

function tempTarget(): string {
	return mkdtempSync(join(tmpdir(), "quality-kit-"));
}

function copyTemplate(target: string, pack: PackId, rel: string): void {
	cpSync(join(packTemplatesRoot(pack), rel), join(target, rel));
}

function finding(target: string, packs: PackId[], path: string) {
	const report = diffAgainst(target, desiredState(target, packs));
	return report.files.find((f) => f.path === path);
}

test("diffAgainst: AGENTS.quality.md copied but not merged into AGENTS.md is a gap", () => {
	const target = tempTarget();
	copyTemplate(target, "js-ts", "AGENTS.quality.md");
	writeFileSync(join(target, "AGENTS.md"), "# Agents\n\nBe nice.\n");

	const f = finding(target, ["js-ts"], "AGENTS.quality.md");
	assert.equal(f?.kind, "merge-into");
	assert.equal(f?.status, "unmerged");
	assert.equal(f?.dest, "AGENTS.md");
});

function runKit(script: "apply" | "audit", target: string, packs: string) {
	const res = spawnSync(
		process.execPath,
		["--import", "tsx", `scripts/${script}.ts`, "--target", target, "--packs", packs],
		{ cwd: kitRoot, encoding: "utf8" },
	);
	return { status: res.status, stdout: res.stdout + res.stderr };
}

test("audit: kotlin-android Target that never merged its fragments reports gaps by kind", () => {
	const target = tempTarget();
	runKit("apply", target, "kotlin-android");
	writeFileSync(join(target, "gradle.properties"), "org.gradle.parallel=true\n");

	const { status, stdout } = runKit("audit", target, "kotlin-android");
	assert.equal(status, 1, stdout);
	const sections = ["### owned", "### seed", "### merge-into"].map((h) =>
		stdout.indexOf(h),
	);
	assert.ok(sections.every((i, n) => i > (sections[n - 1] ?? -1)), stdout);
	const mergeSection = stdout.slice(sections[2]);
	assert.match(mergeSection, /unmerged .*gradle\.quality\.properties → gradle\.properties/);
	assert.match(mergeSection, /unmerged .*AGENTS\.quality\.md → AGENTS\.md/);
});

function mergeFragment(target: string, fragment: string, dest: string): void {
	const existing = existsSync(join(target, dest))
		? readFileSync(join(target, dest), "utf8")
		: "";
	const tuned = readFileSync(join(target, fragment), "utf8").replace(
		"qualityKit.minLineCoverage=0",
		"qualityKit.minLineCoverage=80",
	);
	writeFileSync(join(target, dest), `${existing}\n${tuned}`);
	rmSync(join(target, fragment));
}

test("audit: js-ts + python Target with tuned seeds and merged content is green", () => {
	const target = tempTarget();
	writeFileSync(
		join(target, "package.json"),
		JSON.stringify({ name: "x", dependencies: { lodash: "4" } }),
	);
	writeFileSync(join(target, "AGENTS.md"), "# Repo agents\n");
	runKit("apply", target, "js-ts,python");

	writeFileSync(
		join(target, "biome.complexity.json"),
		JSON.stringify({ linter: { rules: { complexity: { max: 15 } } } }),
	);
	writeFileSync(join(target, "rev-dep.config.json"), '{ "workspaces": [] }\n');
	writeFileSync(
		join(target, "baselines/complexity.json"),
		JSON.stringify({ version: 1, findings: [{ id: "src/a.ts|f", score: 30 }] }),
	);
	writeFileSync(join(target, ".gitignore"), "node_modules/\ncoverage/\n");
	writeFileSync(join(target, ".betterleaksignore"), "src/a.ts:generic:3\n");
	writeFileSync(join(target, "tach.toml"), '[[modules]]\npath = "app"\n');
	writeFileSync(join(target, "vulture_whitelist.py"), "_.unused  # noqa\n");
	writeFileSync(
		join(target, "pnpm-workspace.yaml"),
		"packages:\n  - apps/*\nallowBuilds:\n  esbuild: true\n",
	);
	writeFileSync(
		join(target, "pyproject.toml"),
		'[project]\nname = "x"\n\n[tool.ruff]\nline-length = 88\n\n[tool.basedpyright]\n\n[tool.vulture]\n',
	);
	mergeFragment(target, "AGENTS.quality.md", "AGENTS.md");

	const { status, stdout } = runKit("audit", target, "js-ts,python");
	assert.equal(status, 0, stdout);
});

test("audit: kotlin-android Target with tuned seeds and merged content is green", () => {
	const target = tempTarget();
	writeFileSync(join(target, "gradle.properties"), "android.useAndroidX=true\n");
	runKit("apply", target, "kotlin-android");

	writeFileSync(join(target, ".betterleaksignore"), "app/x.kt:generic:3\n");
	mergeFragment(target, "gradle.quality.properties", "gradle.properties");
	mergeFragment(target, "AGENTS.quality.md", "AGENTS.md");

	const { status, stdout } = runKit("audit", target, "kotlin-android");
	assert.equal(status, 0, stdout);
});

test("audit: dart Target with tuned roots config and merged content is green", () => {
	const target = tempTarget();
	mkdirSync(join(target, "app"));
	writeFileSync(join(target, "app", "pubspec.yaml"), "name: app\n");
	writeFileSync(
		join(target, "Makefile"),
		"build:\n\techo hi\n\ngate-fast:\n\t./tools/quality/gate.sh fast\n\ngate:\n\t./tools/quality/gate.sh full\n",
	);
	runKit("apply", target, "dart");

	writeFileSync(
		join(target, "quality-kit.dart.json"),
		JSON.stringify({ roots: ["app"] }),
	);
	writeFileSync(
		join(target, "app", "dart_dependency_validator.yaml"),
		"ignore:\n  - build_runner\n",
	);
	mergeFragment(target, "AGENTS.quality.md", "AGENTS.md");

	const { status, stdout } = runKit("audit", target, "dart");
	assert.equal(status, 0, stdout);
});

test("apply: does not re-copy a fragment already merged into its destination", () => {
	const target = tempTarget();
	runKit("apply", target, "kotlin-android");
	mergeFragment(target, "AGENTS.quality.md", "AGENTS.md");

	const { stdout } = runKit("apply", target, "kotlin-android");
	assert.ok(!existsSync(join(target, "AGENTS.quality.md")), stdout);
	assert.ok(existsSync(join(target, "gradle.quality.properties")));
	assert.match(stdout, /merged +\[kotlin-android\] AGENTS\.quality\.md → AGENTS\.md/);
});

test("diffAgainst: seed that no longer parses is a gap", () => {
	const target = tempTarget();
	writeFileSync(join(target, "quality-kit.dart.json"), '{ "roots": [');

	const f = finding(target, ["dart"], "quality-kit.dart.json");
	assert.equal(f?.kind, "seed");
	assert.equal(f?.status, "invalid");
});

test("every Pack placement declares a kind", () => {
	const target = tempTarget();
	writeFileSync(join(target, "pubspec.yaml"), "name: app\n");
	for (const id of PACK_IDS) {
		const state = desiredState(target, [id]);
		for (const p of [...state.rootPlacements, ...state.packagePlacements]) {
			assert.ok(
				["owned", "seed", "merge-into"].includes(p.kind),
				`${id}: ${p.targetRel} has no kind`,
			);
		}
	}
});

test("every merge-into fragment, copied verbatim into its dest, counts as merged", () => {
	for (const id of PACK_IDS) {
		const target = tempTarget();
		for (const p of desiredState(target, [id]).rootPlacements) {
			if (p.kind !== "merge-into") continue;
			cpSync(
				join(packTemplatesRoot(p.pack), p.templateRel),
				join(target, p.mergeInto.dest),
			);
			assert.equal(
				finding(target, [id], p.targetRel)?.status,
				"merged",
				`${id}: ${p.templateRel} does not contain its own markers`,
			);
		}
	}
});
