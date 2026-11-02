import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { desiredState, diffAgainst } from "../scripts/desired-state";
import { kitRoot } from "../scripts/kit-fs";
import { PACK_IDS, PACKS, type PackId } from "../scripts/packs";
import {
	git,
	installLefthook,
	tempTarget,
	wireHooks,
	wireKotlinBuild,
	write,
} from "./wired-target";

/** Every unwired gap audit would report, flattened. */
function wiringGaps(target: string, packs: PackId[]) {
	return diffAgainst(target, desiredState(target, packs)).wiring.flatMap((w) =>
		w.gaps.map((g) => ({ pack: w.pack, label: w.label, ...g })),
	);
}

test("every Host Pack with templates contributes wiring probes, including git hooks", () => {
	const target = tempTarget();
	for (const id of PACK_IDS) {
		const pack = PACKS[id];
		if (pack.kind !== "host") continue;
		const contrib = pack.contribute(target, [id]);
		if (contrib.rootPlacements.length === 0) continue;
		assert.ok(
			contrib.probes.some((p) => p.label.startsWith("git hooks installed")),
			`${id} contributes no git hooks probe`,
		);
	}
});

function wiredKotlinTarget(): string {
	const target = tempTarget();
	wireHooks(target, "lefthook");
	wireKotlinBuild(target);
	return target;
}

test("wiring: kotlin-android settings without the quality build-logic is unwired", () => {
	const target = wiredKotlinTarget();
	write(target, "settings.gradle.kts", 'include(":app")\n');

	const gaps = wiringGaps(target, ["kotlin-android"]);
	assert.ok(
		gaps.some((g) => g.fix.includes('includeBuild("build-logic/quality")')),
		JSON.stringify(gaps, null, 1),
	);
});

test("wiring: each Android module that does not apply quality-kit.android is reported by its build file", () => {
	const target = wiredKotlinTarget();
	write(
		target,
		"feature/login/build.gradle",
		"plugins {\n    id 'com.android.library'\n}\n",
	);
	write(target, "core/build.gradle.kts", 'plugins {\n    kotlin("jvm")\n}\n');

	const moduleGaps = wiringGaps(target, ["kotlin-android"]).filter((g) =>
		g.fix.includes('id("quality-kit.android")'),
	);
	assert.deepEqual(
		moduleGaps.map((g) => g.detail),
		["feature/login/build.gradle"],
	);
});

test("wiring: kotlin-android Target where no module applies quality-kit.android is unwired", () => {
	const target = wiredKotlinTarget();
	write(target, "app/build.gradle.kts", "plugins {\n    alias(libs.plugins.myAgp)\n}\n");

	const gaps = wiringGaps(target, ["kotlin-android"]);
	assert.ok(
		gaps.some((g) => g.fix.includes('id("quality-kit.android")')),
		JSON.stringify(gaps, null, 1),
	);
});

test("wiring: kotlin-android root build that does not apply quality-kit.root is unwired", () => {
	const target = wiredKotlinTarget();
	write(
		target,
		"build.gradle.kts",
		'plugins {\n    // id("quality-kit.root")\n    alias(libs.plugins.android.application) apply false\n}\n',
	);

	const gaps = wiringGaps(target, ["kotlin-android"]);
	assert.ok(
		gaps.some((g) => g.fix.includes('id("quality-kit.root")')),
		JSON.stringify(gaps, null, 1),
	);
});

test("wiring: kotlin-android Target whose lefthook hooks are not installed is unwired", () => {
	const target = wiredKotlinTarget();
	rmSync(join(target, ".git/hooks/pre-push"));

	const gaps = wiringGaps(target, ["kotlin-android"]);
	assert.deepEqual(
		gaps.map((g) => [g.detail, g.fix]),
		[["pre-push not installed", "run `lefthook install` in the Target (install lefthook first)"]],
	);
});

test("wiring: fully wired kotlin-android Target has no gaps", () => {
	const target = wiredKotlinTarget();
	const report = diffAgainst(target, desiredState(target, ["kotlin-android"]));

	assert.equal(report.wiring.length, 4);
	assert.deepEqual(wiringGaps(target, ["kotlin-android"]), []);
});

function wiredDartTarget(): string {
	const target = tempTarget();
	wireHooks(target, "lefthook");
	write(target, "pubspec.yaml", "name: app\n");
	return target;
}

test("wiring: dart Target that is not a git repository has no hooks", () => {
	const target = tempTarget();
	write(target, "pubspec.yaml", "name: app\n");

	assert.deepEqual(
		wiringGaps(target, ["dart"]).map((g) => [g.detail, g.fix]),
		[["not a git repository", "git init, then run `lefthook install` in the Target (install lefthook first)"]],
	);
});

test("wiring: fully wired dart Target has no gaps", () => {
	const target = wiredDartTarget();
	const report = diffAgainst(target, desiredState(target, ["dart"]));

	assert.equal(report.wiring.length, 1);
	assert.deepEqual(wiringGaps(target, ["dart"]), []);
});

function wiredJsTsTarget(): string {
	const target = tempTarget();
	wireHooks(target, "husky");
	write(
		target,
		"package.json",
		JSON.stringify({ name: "x", scripts: { test: "vitest run" } }),
	);
	return target;
}

test("wiring: js-ts Target with lefthook-style hooks but no husky hooksPath is unwired", () => {
	const target = wiredJsTsTarget();
	git(target, "config", "--unset", "core.hooksPath");
	installLefthook(target);

	assert.deepEqual(
		wiringGaps(target, ["js-ts"]).map((g) => [g.detail, g.fix]),
		[
			[
				"pre-commit, pre-push not installed",
				"run `pnpm install` in the Target (the prepare script runs husky and sets core.hooksPath)",
			],
		],
	);
});

test("wiring: js-ts Target without a test script is unwired (coverage gate runs tests)", () => {
	const target = wiredJsTsTarget();
	write(target, "package.json", JSON.stringify({ name: "x", scripts: {} }));

	const gaps = wiringGaps(target, ["js-ts"]);
	assert.equal(gaps.length, 1, JSON.stringify(gaps, null, 1));
	assert.match(gaps[0]!.fix, /"test" script/);
});

test("wiring: fully wired js-ts Target has no gaps", () => {
	const target = wiredJsTsTarget();
	const report = diffAgainst(target, desiredState(target, ["js-ts"]));

	assert.equal(report.wiring.length, 2);
	assert.deepEqual(wiringGaps(target, ["js-ts"]), []);
});

function runKit(script: "apply" | "audit", target: string, packs: string) {
	const res = spawnSync(
		process.execPath,
		["--import", "tsx", `scripts/${script}.ts`, "--target", target, "--packs", packs],
		{ cwd: kitRoot, encoding: "utf8" },
	);
	return { status: res.status, stdout: res.stdout + res.stderr };
}

function mergeFragment(target: string, fragment: string, dest: string): void {
	const text = readFileSync(join(target, fragment), "utf8");
	writeFileSync(join(target, dest), text, { flag: "a" });
	rmSync(join(target, fragment));
}

test("audit: an unwired probe alone fails the audit and prints its fix", () => {
	const target = wiredKotlinTarget();
	runKit("apply", target, "kotlin-android");
	mergeFragment(target, "gradle.quality.properties", "gradle.properties");
	mergeFragment(target, "AGENTS.quality.md", "AGENTS.md");
	const green = runKit("audit", target, "kotlin-android");
	assert.equal(green.status, 0, green.stdout);

	write(target, "settings.gradle.kts", 'include(":app")\n');
	const { status, stdout } = runKit("audit", target, "kotlin-android");
	assert.equal(status, 1, stdout);
	const wiring = stdout.slice(stdout.indexOf("## Wiring"));
	assert.match(wiring, /unwired +\[kotlin-android\] settings includes the quality build-logic/);
	assert.match(wiring, /fix: add includeBuild\("build-logic\/quality"\)/);
	assert.match(wiring, /wired +\[kotlin-android\] root build applies quality-kit\.root/);
});

test("audit: AGENTS.md without the Definition of Done is reported once, with the fix", () => {
	const target = wiredJsTsTarget();
	write(target, "AGENTS.md", "# Agents\n");

	const { status, stdout } = runKit("audit", target, "js-ts");
	assert.equal(status, 1, stdout);
	assert.equal(stdout.match(/Definition of Done/g)?.length, 1, stdout);
	assert.match(
		stdout,
		/unmerged .*AGENTS\.quality\.md → AGENTS\.md.*\n +fix: merge languages\/js-ts\/templates\/AGENTS\.quality\.md into AGENTS\.md/,
	);
});
