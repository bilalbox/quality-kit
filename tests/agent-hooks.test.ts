import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { desiredState } from "../scripts/desired-state";
import { kitRoot } from "../scripts/kit-fs";
import {
	composeAgentHooksSettings,
	composeAgentHooksSh,
} from "../scripts/packs/local";
import type { PackId } from "../scripts/packs";

function tempTarget(): string {
	return mkdtempSync(join(tmpdir(), "quality-kit-"));
}

function runApply(target: string, packs: string, extra: string[] = []) {
	return spawnSync(
		join(kitRoot, "node_modules", ".bin", "tsx"),
		[
			join(kitRoot, "scripts", "apply.ts"),
			"--target",
			target,
			"--packs",
			packs,
			...extra,
		],
		{ encoding: "utf8" },
	);
}

test("compose: agent hooks settings wire PostToolUse Edit|Write and Stop to agent-hooks.sh", () => {
	const settings = JSON.parse(composeAgentHooksSettings(["dart"])) as {
		description: string;
		hooks: {
			PostToolUse: { matcher: string; hooks: { command: string }[] }[];
			Stop: { hooks: { command: string }[] }[];
		};
	};
	assert.match(settings.description, /quality-kit agent hooks/);
	assert.equal(settings.hooks.PostToolUse[0]!.matcher, "Edit|Write");
	assert.match(
		settings.hooks.PostToolUse[0]!.hooks[0]!.command,
		/tools\/quality\/agent-hooks\.sh post-edit/,
	);
	assert.match(
		settings.hooks.Stop[0]!.hooks[0]!.command,
		/tools\/quality\/agent-hooks\.sh stop/,
	);
});

test("compose: Stop uses top-level gate fast (not a Host-namespaced gate)", () => {
	for (const packs of [
		["dart"],
		["kotlin-android"],
		["js-ts", "dart"],
		["dart", "kotlin-android"],
	] as PackId[][]) {
		const sh = composeAgentHooksSh(packs);
		assert.match(sh, /tools\/quality\/gate\.sh"?\s+fast/);
		assert.doesNotMatch(sh, /tools\/quality\/dart\/gate\.sh/);
		assert.doesNotMatch(sh, /tools\/quality\/kotlin-android\/gate\.sh/);
	}
	const jsOnly = composeAgentHooksSh(["js-ts"]);
	assert.match(jsOnly, /pnpm gate:fast/);
	assert.doesNotMatch(jsOnly, /tools\/quality\/gate\.sh/);
});

test("compose: post-edit routes changed files to each selected Host only", () => {
	const multi = composeAgentHooksSh(["js-ts", "dart", "kotlin-android"]);
	assert.match(multi, /biome check --write/);
	assert.match(multi, /tools\/quality\/dart\/run-format\.sh"?\s+--fix/);
	assert.match(
		multi,
		/tools\/quality\/kotlin-android\/run-format\.sh"?\s+--fix/,
	);
	// python + js-ts is Fragment mode — no Host .py branch on that selection.
	assert.doesNotMatch(multi, /tools\/quality\/python\/run-format/);

	const dartOnly = composeAgentHooksSh(["dart"]);
	assert.doesNotMatch(dartOnly, /biome check/);
	assert.doesNotMatch(dartOnly, /kotlin-android/);
	assert.match(dartOnly, /tools\/quality\/dart\/run-format\.sh"?\s+--fix/);

	const pythonHost = composeAgentHooksSh(["python", "dart"]);
	assert.match(pythonHost, /\.py\)/);
	assert.match(
		pythonHost,
		/tools\/quality\/python\/run-format\.sh"?\s+--fix/,
	);
	assert.match(pythonHost, /tools\/quality\/dart\/run-format\.sh"?\s+--fix/);
});

test("desiredState: agent hooks Placements absent by default, present when opted in", () => {
	const off = desiredState(tempTarget(), ["dart"]);
	assert.ok(
		!off.rootPlacements.some((p) => p.targetRel === ".claude/settings.json"),
	);
	assert.ok(
		!off.rootPlacements.some(
			(p) => p.targetRel === "tools/quality/agent-hooks.sh",
		),
	);

	const on = desiredState(tempTarget(), ["dart"], { agentHooks: true });
	const settings = on.rootPlacements.find(
		(p) => p.targetRel === ".claude/settings.json",
	);
	const script = on.rootPlacements.find(
		(p) => p.targetRel === "tools/quality/agent-hooks.sh",
	);
	assert.equal(settings?.kind, "owned");
	assert.equal(settings?.content, composeAgentHooksSettings(["dart"]));
	assert.equal(script?.kind, "owned");
	assert.equal(script?.executable, true);
	assert.equal(script?.content, composeAgentHooksSh(["dart"]));
	assert.match(on.rootPlacements.find((p) => p.targetRel === "AGENTS.quality.md")!.content!, /Agent hooks/);
});

test("desiredState: multi-Host agent hooks compose once", () => {
	const packs: PackId[] = ["js-ts", "dart"];
	const state = desiredState(tempTarget(), packs, { agentHooks: true });
	assert.equal(
		state.rootPlacements.filter((p) => p.targetRel === ".claude/settings.json")
			.length,
		1,
	);
	assert.equal(
		state.rootPlacements.filter(
			(p) => p.targetRel === "tools/quality/agent-hooks.sh",
		).length,
		1,
	);
});

test("apply: --agent-hooks writes Claude Code settings and helper script", () => {
	const target = tempTarget();
	const without = runApply(target, "dart");
	assert.equal(without.status, 0, `${without.stdout}${without.stderr}`);
	assert.ok(!existsSync(join(target, ".claude/settings.json")));

	const withHooks = runApply(target, "dart", ["--agent-hooks"]);
	assert.equal(withHooks.status, 0, `${withHooks.stdout}${withHooks.stderr}`);
	assert.ok(existsSync(join(target, ".claude/settings.json")));
	assert.ok(existsSync(join(target, "tools/quality/agent-hooks.sh")));
	const settings = JSON.parse(
		readFileSync(join(target, ".claude/settings.json"), "utf8"),
	) as { hooks: { Stop: unknown[] } };
	assert.ok(settings.hooks.Stop.length > 0);
});

test("agent-hooks stop: failing top-level gate fast exits 2 with failure output", () => {
	const target = tempTarget();
	mkdirSync(join(target, "tools/quality"), { recursive: true });
	writeFileSync(
		join(target, "tools/quality", "gate.sh"),
		'#!/usr/bin/env bash\necho "gate boom" >&2\nexit 1\n',
	);
	chmodSync(join(target, "tools/quality", "gate.sh"), 0o755);
	writeFileSync(
		join(target, "tools/quality", "agent-hooks.sh"),
		composeAgentHooksSh(["dart"]),
	);
	chmodSync(join(target, "tools/quality", "agent-hooks.sh"), 0o755);

	const res = spawnSync(
		join(target, "tools/quality", "agent-hooks.sh"),
		["stop"],
		{
			cwd: target,
			encoding: "utf8",
			env: { ...process.env, CLAUDE_PROJECT_DIR: target },
			input: JSON.stringify({ stop_hook_active: false }),
		},
	);
	assert.equal(res.status, 2, `${res.stdout}${res.stderr}`);
	assert.match(res.stderr, /gate boom/);
});

test("agent-hooks stop: skip when stop_hook_active to avoid a block loop", () => {
	const target = tempTarget();
	mkdirSync(join(target, "tools/quality"), { recursive: true });
	writeFileSync(
		join(target, "tools/quality", "gate.sh"),
		'#!/usr/bin/env bash\nexit 1\n',
	);
	chmodSync(join(target, "tools/quality", "gate.sh"), 0o755);
	writeFileSync(
		join(target, "tools/quality", "agent-hooks.sh"),
		composeAgentHooksSh(["dart"]),
	);
	chmodSync(join(target, "tools/quality", "agent-hooks.sh"), 0o755);

	const res = spawnSync(
		join(target, "tools/quality", "agent-hooks.sh"),
		["stop"],
		{
			cwd: target,
			encoding: "utf8",
			env: { ...process.env, CLAUDE_PROJECT_DIR: target },
			input: JSON.stringify({ stop_hook_active: true }),
		},
	);
	assert.equal(res.status, 0, `${res.stdout}${res.stderr}`);
});

test("agent-hooks post-edit: only checks the edited file path from stdin", () => {
	const sh = composeAgentHooksSh(["js-ts"]);
	assert.match(sh, /tool_input/);
	assert.match(sh, /file_path/);
	assert.doesNotMatch(sh, /biome check --write \./);
});
