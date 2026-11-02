import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { kitRoot } from "../scripts/kit-fs";

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

/** A GitHub token the default rules flag; generated so the kit holds no secret literal. */
function plantLeak(target: string, rel: string): void {
	const token = `ghp_${randomBytes(27).toString("base64url").replace(/[-_]/g, "a").slice(0, 36)}`;
	mkdirSync(dirname(join(target, rel)), { recursive: true });
	writeFileSync(join(target, rel), `const token = "${token}";\n`);
}

function scan(target: string) {
	const res = spawnSync(
		"bash",
		[join(target, "tools/quality/run-secret-scan.sh")],
		{ cwd: target, encoding: "utf8", env: { ...process.env, CI: "" } },
	);
	return { status: res.status, output: res.stdout + res.stderr };
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
