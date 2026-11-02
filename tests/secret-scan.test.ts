import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { kitRoot, languagesRoot } from "../scripts/kit-fs";
import { git } from "./wired-target";

/** Betterleaks is optional locally but must be present in CI. */
function needsBetterleaks(): { skip: string | false } {
	const found = !spawnSync("betterleaks", ["version"]).error;
	if (found || process.env.CI) return { skip: false };
	return { skip: "betterleaks not on PATH" };
}

function appliedTarget(packs: string): string {
	const target = mkdtempSync(join(tmpdir(), "quality-kit-"));
	writeFileSync(join(target, "package.json"), "{}\n");
	const res = spawnSync(
		process.execPath,
		["--import", "tsx", "scripts/apply.ts", "--target", target, "--packs", packs],
		{ cwd: kitRoot, encoding: "utf8" },
	);
	assert.equal(res.status, 0, res.stdout + res.stderr);
	return target;
}

function fakeToken(): string {
	return `ghp_${randomBytes(27).toString("base64url").replace(/[-_]/g, "a").slice(0, 36)}`;
}

/** A GitHub token the default rules flag; generated so the kit holds no secret literal. */
function plantLeak(target: string, rel: string, body?: string): void {
	mkdirSync(dirname(join(target, rel)), { recursive: true });
	writeFileSync(join(target, rel), body ?? `const token = "${fakeToken()}";\n`);
}

function scan(
	target: string,
	opts: { staged?: boolean; env?: NodeJS.ProcessEnv } = {},
) {
	const args = [join(target, "tools/quality/run-secret-scan.sh")];
	if (opts.staged) args.push("--staged");
	const res = spawnSync("bash", args, {
		cwd: target,
		encoding: "utf8",
		env: { ...process.env, CI: "", ...opts.env },
	});
	return { status: res.status, output: res.stdout + res.stderr };
}

function initGit(target: string): void {
	git(target, "init", "-q");
	git(target, "config", "user.email", "kit@example.com");
	git(target, "config", "user.name", "kit");
	git(target, "config", "commit.gpgsign", "false");
}

for (const packs of ["js-ts", "dart", "kotlin-android"]) {
	test(`secret scan: a clean ${packs} Target passes with its composed config`, needsBetterleaks(), () => {
		const { status, output } = scan(appliedTarget(packs));
		assert.equal(status, 0, output);
	});
}

test("secret scan: a leak outside every allowlist fails", needsBetterleaks(), () => {
	const target = appliedTarget("dart");
	plantLeak(target, "lib/config.js");
	assert.equal(scan(target).status, 1);
});

test("secret scan: shared allowlist entries apply to every Host", needsBetterleaks(), () => {
	const target = appliedTarget("kotlin-android");
	plantLeak(target, "fixtures/token.js");
	const { status, output } = scan(target);
	assert.equal(status, 0, output);
});

/** A `curl` that "downloads" a well-formed tarball holding a fake betterleaks. */
function stubCurlDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "quality-kit-curl-"));
	writeFileSync(
		join(dir, "curl"),
		`#!/usr/bin/env bash
set -euo pipefail
while [[ $# -gt 0 ]]; do
	if [[ "$1" == "-o" ]]; then out="$2"; shift; fi
	shift
done
src="$(mktemp -d)"
printf '#!/bin/sh\\necho 1.9.0\\n' >"\${src}/betterleaks"
chmod +x "\${src}/betterleaks"
tar -czf "\${out}" -C "\${src}" betterleaks
`,
		{ mode: 0o755 },
	);
	return dir;
}

test("install-betterleaks: refuses an archive that does not match the pinned checksum", () => {
	const dest = mkdtempSync(join(tmpdir(), "quality-kit-bin-"));
	const res = spawnSync(
		"bash",
		[join(kitRoot, "languages/shared/templates/tools/quality/install-betterleaks.sh"), dest],
		{
			encoding: "utf8",
			env: { ...process.env, PATH: `${stubCurlDir()}:${process.env.PATH}` },
		},
	);
	assert.notEqual(res.status, 0, res.stdout + res.stderr);
	assert.match(res.stderr, /checksum/i);
	assert.deepEqual(readdirSync(dest), []);
});

test("secret scan: a Pack allowlist adds to the shared config", needsBetterleaks(), () => {
	const target = appliedTarget("dart");
	plantLeak(target, ".dart_tool/cache.js");
	const withPack = scan(target);
	assert.equal(withPack.status, 0, withPack.output);

	rmSync(join(target, ".betterleaks.d/dart.toml"));
	assert.equal(scan(target).status, 1);
});

test("secret scan: a fake secret in a test source file fails", needsBetterleaks(), () => {
	const target = appliedTarget("js-ts");
	plantLeak(target, "src/foo.test.ts");
	assert.equal(scan(target).status, 1);

	const android = appliedTarget("kotlin-android");
	plantLeak(android, "app/src/test/java/Token.kt");
	assert.equal(scan(android).status, 1);
});

test("secret scan: staging a .env or .jks with a leak fails the gate", needsBetterleaks(), () => {
	const target = appliedTarget("dart");
	initGit(target);
	git(target, "add", "-A");
	git(target, "commit", "-q", "-m", "init");

	plantLeak(target, ".env", `TOKEN=${fakeToken()}\n`);
	git(target, "add", "--", ".env");
	assert.equal(scan(target, { staged: true }).status, 1);

	git(target, "reset", "-q", "HEAD");
	plantLeak(target, "upload.jks", `api_key=${fakeToken()}\n`);
	git(target, "add", "--", "upload.jks");
	assert.equal(scan(target, { staged: true }).status, 1);
});

test("shared Betterleaks config has no project-specific rules", () => {
	const toml = readFileSync(
		join(languagesRoot, "shared/templates/.betterleaks.toml"),
		"utf8",
	);
	assert.doesNotMatch(toml, /\[\[rules\]\]/);
	assert.doesNotMatch(toml, /retell/i);
});
