import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function tempTarget(): string {
	return mkdtempSync(join(tmpdir(), "quality-kit-"));
}

export function write(target: string, rel: string, text: string): void {
	mkdirSync(dirname(join(target, rel)), { recursive: true });
	writeFileSync(join(target, rel), text);
}

export function git(target: string, ...args: string[]): void {
	const res = spawnSync("git", ["-C", target, ...args], { encoding: "utf8" });
	assert.equal(res.status, 0, res.stderr);
}

function writeHook(target: string, rel: string, text: string): void {
	write(target, rel, text);
	chmodSync(join(target, rel), 0o755);
}

/** What `lefthook install` leaves behind: executable hooks that call lefthook. */
export function installLefthook(target: string): void {
	for (const hook of ["pre-commit", "pre-push"]) {
		writeHook(target, `.git/hooks/${hook}`, `#!/bin/sh\ncall_lefthook run "${hook}" "$@"\n`);
	}
}

/** What husky 9 (the js-ts `prepare` script) leaves behind. */
export function installHusky(target: string): void {
	git(target, "config", "core.hooksPath", ".husky/_");
	for (const hook of ["pre-commit", "pre-push"]) {
		writeHook(target, `.husky/_/${hook}`, '#!/usr/bin/env sh\n. "$(dirname "$0")/h"\n');
	}
}

/** git init plus the Host's hook manager install. */
export function wireHooks(target: string, manager: "lefthook" | "husky"): void {
	git(target, "init", "-q");
	if (manager === "lefthook") installLefthook(target);
	else installHusky(target);
}

/** The three build lines kotlin-android MODULE.md "Wiring" asks for. */
export function wireKotlinBuild(target: string): void {
	write(
		target,
		"settings.gradle.kts",
		'pluginManagement {\n    includeBuild("build-logic/quality")\n}\ninclude(":app")\n',
	);
	write(
		target,
		"build.gradle.kts",
		'plugins {\n    alias(libs.plugins.android.application) apply false\n    id("quality-kit.root")\n}\n',
	);
	write(
		target,
		"app/build.gradle.kts",
		'plugins {\n    alias(libs.plugins.android.application)\n    id("quality-kit.android")\n}\n',
	);
}
