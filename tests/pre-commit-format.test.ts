import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	cpSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { packTemplatesRoot } from "../scripts/kit-fs";

type FormatPack = {
	id: "dart" | "kotlin-android";
	file: string;
	setup: Record<string, string>;
	formatted: (n: number) => string;
	misformatted: (n: number) => string;
};

const DART: FormatPack = {
	id: "dart",
	file: "lib/a.dart",
	setup: { "pubspec.yaml": "name: app\nenvironment:\n  sdk: ^3.9.0\n" },
	formatted: (n) => `void f${n}() {\n  print(${n});\n}\n`,
	misformatted: (n) => `void f${n}(){print(${n});}\n`,
};

const KOTLIN: FormatPack = {
	id: "kotlin-android",
	file: "app/src/main/kotlin/A.kt",
	setup: {},
	formatted: (n) => `fun f${n}() {\n    println(${n})\n}\n`,
	misformatted: (n) => `fun f${n}(){println(${n})}\n`,
};

function onPath(bin: string): boolean {
	return spawnSync("bash", ["-c", `command -v ${bin}`]).status === 0;
}

const SKIP: Record<FormatPack["id"], string | false> = {
	dart: onPath("dart") ? false : "dart not on PATH",
	"kotlin-android": false,
};

const SKIP_LEFTHOOK = onPath("lefthook") ? false : "lefthook not on PATH";

type Hook = "plain" | "lefthook";

/** Ten top-level functions; `override` swaps the body source of function n. */
function source(pack: FormatPack, override: Record<number, string> = {}) {
	const parts: string[] = [];
	for (let n = 1; n <= 10; n++) {
		parts.push(override[n] ?? pack.formatted(n));
	}
	return parts.join("\n");
}

function git(cwd: string, ...args: string[]) {
	return spawnSync("git", args, {
		cwd,
		encoding: "utf8",
		env: { ...process.env, LEFTHOOK_EXCLUDE: "secrets" },
	});
}

function sh(cwd: string, command: string) {
	return spawnSync("bash", ["-c", command], { cwd, encoding: "utf8" });
}

function write(target: string, rel: string, contents: string) {
	mkdirSync(dirname(join(target, rel)), { recursive: true });
	writeFileSync(join(target, rel), contents);
}

/**
 * Target repo with the Pack's tools/quality and either a plain pre-commit hook
 * running the format step, or the Pack's lefthook.yml installed (the secrets
 * command is excluded via LEFTHOOK_EXCLUDE in `git`).
 */
function chmodTree(dir: string): void {
	for (const name of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, name.name);
		if (name.isDirectory()) chmodTree(path);
		else if (name.name.endsWith(".sh")) chmodSync(path, 0o755);
	}
}

function formatScript(pack: FormatPack): string {
	return `./tools/quality/${pack.id}/run-format.sh`;
}

function targetRepo(pack: FormatPack, hook: Hook = "plain"): string {
	const target = mkdtempSync(join(tmpdir(), "quality-kit-"));
	const templates = packTemplatesRoot(pack.id);
	const quality = join(target, "tools/quality");
	cpSync(join(templates, "tools/quality"), quality, { recursive: true });
	chmodTree(quality);
	git(target, "init", "-q");
	git(target, "config", "user.email", "kit@example.com");
	git(target, "config", "user.name", "kit");
	git(target, "config", "commit.gpgsign", "false");
	if (hook === "plain") {
		git(target, "config", "core.hooksPath", ".git/hooks");
	}
	for (const [rel, contents] of Object.entries(pack.setup)) {
		write(target, rel, contents);
	}
	write(target, pack.file, source(pack));
	git(target, "add", "-A");
	assert.equal(git(target, "commit", "-q", "-m", "init").status, 0);
	if (hook === "lefthook") {
		cpSync(join(templates, "lefthook.yml"), join(target, "lefthook.yml"));
		assert.equal(sh(target, "lefthook install").status, 0);
		return target;
	}
	write(
		target,
		".git/hooks/pre-commit",
		`#!/usr/bin/env bash\nexec ${formatScript(pack)} --staged\n`,
	);
	chmodSync(join(target, ".git/hooks/pre-commit"), 0o755);
	return target;
}

/** Stage `staged` for the file, then leave `working` in the working tree. */
function partiallyStage(
	target: string,
	pack: FormatPack,
	staged: string,
	working: string,
) {
	write(target, pack.file, staged);
	git(target, "add", "--", pack.file);
	write(target, pack.file, working);
}

function committed(target: string, rel: string): string {
	return git(target, "show", `HEAD:${rel}`).stdout;
}

function indexed(target: string, rel: string): string {
	return git(target, "show", `:${rel}`).stdout;
}

for (const pack of [DART, KOTLIN]) {
	test(`${pack.id} pre-commit: commits exactly the staged hunk of a partially staged file`, {
		skip: SKIP[pack.id],
	}, () => {
		const target = targetRepo(pack);
		const staged = source(pack, { 1: pack.formatted(100) });
		const working = source(pack, {
			1: pack.formatted(100),
			10: pack.misformatted(1000),
		});
		partiallyStage(target, pack, staged, working);

		const commit = git(target, "commit", "-q", "-m", "staged hunk");

		assert.equal(commit.status, 0, commit.stderr);
		assert.equal(committed(target, pack.file), staged);
		assert.equal(readFileSync(join(target, pack.file), "utf8"), working);
	});

	test(`${pack.id} pre-commit: misformatted staged file fails with a fix command that works`, {
		skip: SKIP[pack.id],
	}, () => {
		const target = targetRepo(pack);
		const head = committed(target, pack.file);
		const bad = source(pack, { 1: pack.misformatted(100) });
		partiallyStage(target, pack, bad, bad);

		const commit = git(target, "commit", "-q", "-m", "bad");

		assert.notEqual(commit.status, 0);
		assert.equal(committed(target, pack.file), head);
		assert.equal(indexed(target, pack.file), bad);
		assert.equal(readFileSync(join(target, pack.file), "utf8"), bad);
		const fix = `${formatScript(pack)} --fix ${pack.file} && git add ${pack.file}`;
		assert.ok(
			commit.stderr.includes(fix),
			`expected "${fix}" in:\n${commit.stderr}`,
		);

		assert.equal(sh(target, fix).status, 0);
		const retry = git(target, "commit", "-q", "-m", "fixed");
		assert.equal(retry.status, 0, retry.stderr);
		assert.equal(
			committed(target, pack.file),
			source(pack, { 1: pack.formatted(100) }),
		);
	});

	for (const hook of ["plain", "lefthook"] as const) {
		test(`${pack.id} pre-commit (${hook}): misformatted staged hunk leaves index and unstaged hunk untouched`, {
			skip: SKIP[pack.id] || (hook === "lefthook" && SKIP_LEFTHOOK),
		}, () => {
			const target = targetRepo(pack, hook);
			const head = committed(target, pack.file);
			const staged = source(pack, { 1: pack.misformatted(100) });
			const working = source(pack, {
				1: pack.misformatted(100),
				10: pack.formatted(1000),
			});
			partiallyStage(target, pack, staged, working);

			const commit = git(target, "commit", "-q", "-m", "bad hunk");

			assert.notEqual(commit.status, 0);
			assert.equal(committed(target, pack.file), head);
			assert.equal(indexed(target, pack.file), staged);
			assert.equal(readFileSync(join(target, pack.file), "utf8"), working);
			const output = commit.stdout + commit.stderr;
			assert.ok(
				output.includes(
					`${formatScript(pack)} --fix ${pack.file} && git add -p ${pack.file}`,
				),
				output,
			);
		});
	}
}
