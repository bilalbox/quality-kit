/**
 * Fast seams for adoption smoke: Host smoke registry + orchestrator.
 * Real Pack smokes are `pnpm smoke -- --pack <id>` (not part of `pnpm test`).
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { kitRoot } from "../scripts/kit-fs";
import { runSmoke, StepFailed } from "../scripts/smoke/adopt";
import { HOST_SMOKES } from "../scripts/smoke/index";
import type { HostSmoke } from "../scripts/smoke/types";

test("smoke registry: every Host Pack has a HostSmoke", () => {
	assert.ok(HOST_SMOKES["js-ts"]);
	assert.ok(HOST_SMOKES.python);
	assert.ok(HOST_SMOKES.dart);
	assert.ok(HOST_SMOKES["kotlin-android"]);
});

test("runSmoke: refuses when a required tool is missing", () => {
	const smoke: HostSmoke = {
		tools: ["definitely-not-on-path-quality-kit-smoke"],
		scaffold() {},
		wire() {},
		gate: [],
	};
	assert.throws(
		() =>
			runSmoke({
				pack: "js-ts",
				smoke,
				kitRoot,
				workParent: mkdtempSync(join(tmpdir(), "qk-smoke-")),
			}),
		(err: unknown) =>
			err instanceof StepFailed &&
			/definitely-not-on-path-quality-kit-smoke/.test(err.message),
	);
});

test("runSmoke: applies, wires, audits, then runs gate commands", () => {
	const workParent = mkdtempSync(join(tmpdir(), "qk-smoke-"));
	const seen: string[] = [];
	const smoke: HostSmoke = {
		tools: ["git"],
		scaffold(target) {
			seen.push(`scaffold:${target}`);
			mkdirSync(target, { recursive: true });
			writeFileSync(
				join(target, "package.json"),
				JSON.stringify({ name: "smoke-fake", private: true }),
			);
		},
		wire(target) {
			seen.push(`wire:${target}`);
		},
		gate: [["sh", "-c", "echo gate-ok > gate.out"]],
	};

	const target = runSmoke({
		pack: "js-ts",
		smoke,
		kitRoot,
		workParent,
		apply: (t) => {
			seen.push(`apply:${t}`);
		},
		audit: (t) => {
			seen.push(`audit:${t}`);
		},
		keep: true,
	});

	assert.match(target, /smoke-js-ts-/);
	assert.deepEqual(
		seen.map((s) => s.replaceAll(target, "<target>")),
		[
			"scaffold:<target>",
			"apply:<target>",
			"wire:<target>",
			"audit:<target>",
		],
	);
	assert.equal(readFileSync(join(target, "gate.out"), "utf8").trim(), "gate-ok");
});
