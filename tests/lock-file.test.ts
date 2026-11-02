import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { desiredState, diffAgainst } from "../scripts/desired-state";
import { kitRoot } from "../scripts/kit-fs";

const LOCK = ".quality-kit.lock.json";

type Lock = {
	version: number;
	kitRevision: string | null;
	files: Record<string, string>;
};

function tempTarget(): string {
	return mkdtempSync(join(tmpdir(), "quality-kit-"));
}

function runKit(script: "apply" | "audit", target: string, packs: string) {
	const res = spawnSync(
		process.execPath,
		["--import", "tsx", `scripts/${script}.ts`, "--target", target, "--packs", packs],
		{ cwd: kitRoot, encoding: "utf8" },
	);
	return { status: res.status, stdout: res.stdout + res.stderr };
}

function readLock(target: string): Lock {
	return JSON.parse(readFileSync(join(target, LOCK), "utf8")) as Lock;
}

function sha256(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

test("apply records the kit revision and a hash of each owned Placement as written", () => {
	const target = tempTarget();
	runKit("apply", target, "kotlin-android");

	const lock = readLock(target);
	const head = spawnSync("git", ["rev-parse", "HEAD"], {
		cwd: kitRoot,
		encoding: "utf8",
	}).stdout.trim();
	assert.equal(lock.version, 1);
	assert.equal(lock.kitRevision, head);

	const state = desiredState(target, ["kotlin-android"]);
	const owned = state.rootPlacements
		.filter((p) => p.kind === "owned")
		.map((p) => p.targetRel)
		.sort();
	assert.deepEqual(Object.keys(lock.files).sort(), owned);
	assert.equal(
		lock.files["config/detekt/detekt.yml"],
		sha256(readFileSync(join(target, "config/detekt/detekt.yml"), "utf8")),
	);
});

const DETEKT = "config/detekt/detekt.yml";
const OLD_KIT_DETEKT = "build:\n  maxIssues: 0\n";

function ownedStatus(target: string, path: string) {
	const report = diffAgainst(target, desiredState(target, ["kotlin-android"]));
	return report.files.find((f) => f.path === path)?.status;
}

/** A Target last applied from an older kit whose detekt.yml was OLD_KIT_DETEKT. */
function appliedFromOlderKit(): string {
	const target = tempTarget();
	runKit("apply", target, "kotlin-android");
	writeFileSync(join(target, DETEKT), OLD_KIT_DETEKT);
	const lock = readLock(target);
	lock.files[DETEKT] = sha256(OLD_KIT_DETEKT);
	writeFileSync(join(target, LOCK), JSON.stringify(lock));
	return target;
}

test("diffAgainst: owned file untouched since apply and equal to the template is current", () => {
	const target = tempTarget();
	runKit("apply", target, "kotlin-android");
	assert.equal(ownedStatus(target, DETEKT), "current");
});

test("diffAgainst: owned file untouched since an older kit's apply is stale", () => {
	assert.equal(ownedStatus(appliedFromOlderKit(), DETEKT), "stale");
});

test("diffAgainst: owned file edited after apply is customized", () => {
	const target = tempTarget();
	runKit("apply", target, "kotlin-android");
	writeFileSync(join(target, DETEKT), "build:\n  maxIssues: 10\n");
	assert.equal(ownedStatus(target, DETEKT), "customized");
});

test("audit: Target without a lock file reports owned drift and hints to re-run apply", () => {
	const target = tempTarget();
	runKit("apply", target, "kotlin-android");
	rmSync(join(target, LOCK));
	writeFileSync(join(target, DETEKT), "build:\n  maxIssues: 10\n");

	const { status, stdout } = runKit("audit", target, "kotlin-android");
	assert.equal(status, 1, stdout);
	assert.match(stdout, /drift +\[kotlin-android\] config\/detekt\/detekt\.yml/);
	assert.match(stdout, /\.quality-kit\.lock\.json missing.*re-run apply/);
});

test("audit: unreadable lock file is treated as missing, and apply rewrites it", () => {
	const target = tempTarget();
	runKit("apply", target, "kotlin-android");
	writeFileSync(join(target, LOCK), "<<<<<<< HEAD\n");

	const audited = runKit("audit", target, "kotlin-android");
	assert.match(audited.stdout, /\.quality-kit\.lock\.json unreadable.*re-run apply/);
	runKit("apply", target, "kotlin-android");
	assert.ok(readLock(target).files[DETEKT]);
});

test("audit: Target with a lock file reports stale and customized owned files, without the hint", () => {
	const target = appliedFromOlderKit();
	writeFileSync(join(target, "config/lint/lint.xml"), "<lint />\n");

	const { status, stdout } = runKit("audit", target, "kotlin-android");
	assert.equal(status, 1, stdout);
	assert.match(stdout, /stale +\[kotlin-android\] config\/detekt\/detekt\.yml/);
	assert.match(stdout, /customized +\[kotlin-android\] config\/lint\/lint\.xml/);
	assert.doesNotMatch(stdout, /re-run apply/);
});

test("re-apply keeps the recorded hash of an owned file that no longer matches the template", () => {
	const target = appliedFromOlderKit();
	runKit("apply", target, "kotlin-android");
	assert.equal(readLock(target).files[DETEKT], sha256(OLD_KIT_DETEKT));
	assert.equal(ownedStatus(target, DETEKT), "stale");
});
