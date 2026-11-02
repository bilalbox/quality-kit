import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { kitRoot } from "../scripts/kit-fs";

/** Applied js-ts Target whose node_modules resolve to the kit's Biome + tsx. */
function adoptedTarget(): string {
	const target = mkdtempSync(join(tmpdir(), "quality-kit-"));
	writeFileSync(
		join(target, "package.json"),
		JSON.stringify({ name: "x", dependencies: { lodash: "4" } }),
	);
	const apply = spawnSync(
		join(kitRoot, "node_modules/.bin/tsx"),
		["scripts/apply.ts", "--target", target, "--packs", "js-ts"],
		{ cwd: kitRoot, encoding: "utf8" },
	);
	assert.equal(apply.status, 0, apply.stderr);
	symlinkSync(join(kitRoot, "node_modules"), join(target, "node_modules"));
	spawnSync("git", ["init", "-q"], { cwd: target });
	mkdirSync(join(target, "src"));
	return target;
}

function pnpm(
	target: string,
	args: string[],
	env: NodeJS.ProcessEnv = {},
): { status: number | null; output: string } {
	const { CI: _ci, ...base } = process.env;
	const result = spawnSync("pnpm", args, {
		cwd: target,
		encoding: "utf8",
		// node_modules is the kit's own: pnpm must not install the Target's deps into it.
		env: { ...base, pnpm_config_verify_deps_before_run: "false", ...env },
	});
	return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

test("js-ts gate: one auto-fixable Biome warning fails lint and names the fix command", () => {
	const target = adoptedTarget();
	writeFileSync(
		join(target, "src/a.ts"),
		"export function f(): number {\n\tlet x = 1;\n\treturn x;\n}\n",
	);

	const lint = pnpm(target, ["lint"]);

	assert.notEqual(lint.status, 0, lint.output);
	assert.match(lint.output, /lint\/style\/useConst/);
	assert.match(lint.output, /pnpm fix/);
});

test("js-ts gate: pnpm fix then lint passes with zero Biome diagnostics", () => {
	const target = adoptedTarget();
	writeFileSync(
		join(target, "src/a.ts"),
		[
			'import { readFileSync } from "node:fs";',
			'import { join } from "node:path";',
			"export function f(name: string): string {",
			"\tlet x = 1;",
			'\treturn "n" + name + x + join("a", "b");',
			"}",
			"",
		].join("\n"),
	);

	const fix = pnpm(target, ["fix"]);
	const lint = pnpm(target, ["lint"]);
	const check = pnpm(target, ["exec", "biome", "check", "."]);

	assert.equal(fix.status, 0, fix.output);
	assert.equal(lint.status, 0, lint.output);
	assert.match(check.output, /Checked \d+ files/);
	assert.doesNotMatch(check.output, /Found \d+ (error|warning|info)/);
	assert.doesNotMatch(
		readFileSync(join(target, "src/a.ts"), "utf8"),
		/readFileSync|"n" \+/,
	);
});

test("js-ts gate: generated pnpm-lock.yaml is not a Biome diagnostic", () => {
	const target = adoptedTarget();
	copyFileSync(
		join(kitRoot, "pnpm-lock.yaml"),
		join(target, "pnpm-lock.yaml"),
	);

	const lint = pnpm(target, ["lint"]);

	assert.equal(lint.status, 0, lint.output);
});

test("js-ts gate: a floating promise in src/ fails gate:fast", () => {
	const target = adoptedTarget();
	writeFileSync(
		join(target, "src/a.ts"),
		[
			"async function save(): Promise<void> {}",
			"export function onClick(): void {",
			"\tsave();",
			"}",
			"",
		].join("\n"),
	);

	const gate = pnpm(target, ["gate:fast"]);

	assert.notEqual(gate.status, 0, gate.output);
	assert.match(gate.output, /src\/a\.ts:3:\d+ +lint\/nursery\/noFloatingPromises/);
});

test("js-ts gate: a promise passed where a void callback is expected fails gate:fast", () => {
	const target = adoptedTarget();
	writeFileSync(
		join(target, "src/a.ts"),
		[
			"async function save(id: string): Promise<void> {",
			"\tawait Promise.resolve(id);",
			"}",
			"export function saveAll(ids: string[]): void {",
			"\tids.forEach(async (id) => {",
			"\t\tawait save(id);",
			"\t});",
			"}",
			"",
		].join("\n"),
	);

	const gate = pnpm(target, ["gate:fast"]);

	assert.notEqual(gate.status, 0, gate.output);
	assert.match(gate.output, /src\/a\.ts:5:\d+ +lint\/nursery\/noMisusedPromises/);
});

const LEGACY_SOURCE = [
	"export function legacy(a: any, b: any) {",
	"  let unchanged = a == b",
	"  return unchanged",
	"}",
	"",
].join("\n");

test("js-ts legacy adopt: baseline refused until pnpm fix clears unbaselinable diagnostics", () => {
	const target = adoptedTarget();
	writeFileSync(join(target, "src/legacy.ts"), LEGACY_SOURCE);

	const update = pnpm(target, ["lint", "--", "--update"]);

	assert.notEqual(update.status, 0, update.output);
	assert.match(update.output, /format/);
	assert.match(update.output, /pnpm fix/);
});

test("js-ts legacy adopt: fix, then baseline remaining warnings shrink-only", () => {
	const target = adoptedTarget();
	writeFileSync(join(target, "src/legacy.ts"), LEGACY_SOURCE);

	pnpm(target, ["fix"]);
	const beforeBaseline = pnpm(target, ["lint"]);
	const update = pnpm(target, ["lint", "--", "--update"]);
	const afterBaseline = pnpm(target, ["lint"]);

	assert.notEqual(beforeBaseline.status, 0, beforeBaseline.output);
	assert.equal(update.status, 0, update.output);
	assert.equal(afterBaseline.status, 0, afterBaseline.output);
	const baseline = JSON.parse(
		readFileSync(join(target, "baselines/biome-diagnostics.json"), "utf8"),
	) as { findings: Array<{ id: string; score: number }> };
	assert.deepEqual(
		baseline.findings.map(({ id, score }) => ({ id, score })),
		[
			{ id: "src/legacy.ts|lint/suspicious/noDoubleEquals", score: 1 },
			{ id: "src/legacy.ts|lint/suspicious/noExplicitAny", score: 2 },
		],
	);

	writeFileSync(
		join(target, "src/legacy.ts"),
		`${readFileSync(join(target, "src/legacy.ts"), "utf8")}export const more: any = 1;\n`,
	);
	const grown = pnpm(target, ["lint"]);
	const ciUpdate = pnpm(target, ["lint", "--", "--update"], { CI: "true" });

	assert.notEqual(grown.status, 0, grown.output);
	assert.match(
		grown.output,
		/src\/legacy\.ts\|lint\/suspicious\/noExplicitAny/,
	);
	assert.match(grown.output, /pnpm fix/);
	assert.equal(ciUpdate.status, 2, ciUpdate.output);
});
