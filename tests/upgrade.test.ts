import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { desiredState, diffAgainst } from "../scripts/desired-state";
import { kitRoot, packTemplatesRoot, sharedTemplatesRoot } from "../scripts/kit-fs";

const LOCK = ".quality-kit.lock.json";
const PACKS = "kotlin-android";
const DETEKT = "config/detekt/detekt.yml";
const OLD_KIT_DETEKT = "build:\n  maxIssues: 0\n";

function runKit(script: "apply" | "upgrade", target: string, ...flags: string[]) {
	const res = spawnSync(
		process.execPath,
		["--import", "tsx", `scripts/${script}.ts`, "--target", target, "--packs", PACKS, ...flags],
		{ cwd: kitRoot, encoding: "utf8" },
	);
	return { status: res.status, stdout: res.stdout + res.stderr };
}

function sha256(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

function read(target: string, rel: string): string {
	return readFileSync(join(target, rel), "utf8");
}

function template(rel: string): string {
	return readFileSync(join(packTemplatesRoot(PACKS), rel), "utf8");
}

function lockFiles(target: string): Record<string, string> {
	return (JSON.parse(read(target, LOCK)) as { files: Record<string, string> }).files;
}

function statusOf(target: string, path: string) {
	const report = diffAgainst(target, desiredState(target, [PACKS]));
	return report.files.find((f) => f.path === path)?.status;
}

/** A Target last applied from an older kit whose detekt.yml was OLD_KIT_DETEKT. */
function appliedFromOlderKit(): string {
	const target = mkdtempSync(join(tmpdir(), "quality-kit-"));
	runKit("apply", target);
	writeFileSync(join(target, DETEKT), OLD_KIT_DETEKT);
	const lock = JSON.parse(read(target, LOCK)) as { files: Record<string, string> };
	lock.files[DETEKT] = sha256(OLD_KIT_DETEKT);
	writeFileSync(join(target, LOCK), JSON.stringify(lock));
	return target;
}

test("upgrade replaces a stale owned file with the current template and records it", () => {
	const target = appliedFromOlderKit();

	const { status, stdout } = runKit("upgrade", target);
	assert.equal(status, 0, stdout);
	assert.equal(read(target, DETEKT), template(DETEKT));
	assert.equal(lockFiles(target)[DETEKT], sha256(template(DETEKT)));
	assert.equal(statusOf(target, DETEKT), "current");
	assert.match(stdout, /updated +\[kotlin-android\] config\/detekt\/detekt\.yml/);
});

test("upgrade replaces a stale shared-layer file from the shared templates", () => {
	const target = appliedFromOlderKit();
	const config = ".betterleaks.toml";
	const oldConfig = "[extend]\nuseDefault = true\n";
	writeFileSync(join(target, config), oldConfig);
	const lock = JSON.parse(read(target, LOCK)) as { files: Record<string, string> };
	lock.files[config] = sha256(oldConfig);
	writeFileSync(join(target, LOCK), JSON.stringify(lock));

	const { status, stdout } = runKit("upgrade", target);
	assert.equal(status, 0, stdout);
	assert.equal(
		read(target, config),
		readFileSync(join(sharedTemplatesRoot, config), "utf8"),
	);
	assert.match(stdout, /updated +\[shared\] \.betterleaks\.toml/);
});

test("upgrade leaves an updated shell script executable", () => {
	const target = appliedFromOlderKit();
	const gate = "tools/quality/gate.sh";
	writeFileSync(join(target, gate), "#!/usr/bin/env bash\n");
	chmodSync(join(target, gate), 0o644);
	const lock = JSON.parse(read(target, LOCK)) as { files: Record<string, string> };
	lock.files[gate] = sha256("#!/usr/bin/env bash\n");
	writeFileSync(join(target, LOCK), JSON.stringify(lock));

	runKit("upgrade", target);
	assert.equal(read(target, gate), template(gate));
	assert.equal(statSync(join(target, gate)).mode & 0o111, 0o111);
});

const LINT = "config/lint/lint.xml";
const SEED = ".betterleaksignore";

test("upgrade never modifies customized owned files or seeds, and lists the customized ones", () => {
	const target = appliedFromOlderKit();
	writeFileSync(join(target, LINT), "<lint />\n");
	writeFileSync(join(target, SEED), "tuned-by-target\n");
	const lintHash = lockFiles(target)[LINT];

	const { status, stdout } = runKit("upgrade", target);
	assert.equal(status, 0, stdout);
	assert.equal(read(target, LINT), "<lint />\n");
	assert.equal(read(target, SEED), "tuned-by-target\n");
	assert.equal(lockFiles(target)[LINT], lintHash);
	assert.match(stdout, /customized +\[kotlin-android\] config\/lint\/lint\.xml/);
	assert.match(stdout, /SKILL\.md "Drift playbook"/);
	assert.doesNotMatch(stdout, /\.betterleaksignore/);
});

test("upgrade --dry-run shows what would change and writes nothing", () => {
	const target = appliedFromOlderKit();
	writeFileSync(join(target, LINT), "<lint />\n");
	const lockBefore = read(target, LOCK);

	const { status, stdout } = runKit("upgrade", target, "--dry-run");
	assert.equal(status, 0, stdout);
	assert.match(stdout, /would update +\[kotlin-android\] config\/detekt\/detekt\.yml/);
	assert.match(stdout, /customized +\[kotlin-android\] config\/lint\/lint\.xml/);
	assert.equal(read(target, DETEKT), OLD_KIT_DETEKT);
	assert.equal(read(target, LOCK), lockBefore);
});

test("upgrade leaves an owned file with no recorded hash alone and lists it as drift", () => {
	const target = appliedFromOlderKit();
	writeFileSync(join(target, LINT), "<lint />\n");
	const lock = JSON.parse(read(target, LOCK)) as { files: Record<string, string> };
	delete lock.files[LINT];
	writeFileSync(join(target, LOCK), JSON.stringify(lock));

	const { status, stdout } = runKit("upgrade", target);
	assert.equal(status, 0, stdout);
	assert.equal(read(target, LINT), "<lint />\n");
	assert.equal(lockFiles(target)[LINT], undefined);
	assert.match(stdout, /drift +\[kotlin-android\] config\/lint\/lint\.xml/);
});

test("upgrade does not create missing owned files; it points to apply", () => {
	const target = appliedFromOlderKit();
	rmSync(join(target, LINT));

	const { status, stdout } = runKit("upgrade", target);
	assert.equal(status, 0, stdout);
	assert.equal(existsSync(join(target, LINT)), false);
	assert.match(stdout, /missing +\[kotlin-android\] config\/lint\/lint\.xml/);
	assert.match(stdout, /run apply/);
});

test("upgrade refuses a Target without a lock file and writes nothing", () => {
	const target = appliedFromOlderKit();
	rmSync(join(target, LOCK));

	const { status, stdout } = runKit("upgrade", target);
	assert.equal(status, 2, stdout);
	assert.match(stdout, /\.quality-kit\.lock\.json missing.*run apply/);
	assert.equal(read(target, DETEKT), OLD_KIT_DETEKT);
	assert.equal(existsSync(join(target, LOCK)), false);
});
