import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { desiredState } from "../scripts/desired-state";
import { kitRoot } from "../scripts/kit-fs";

function tempTarget(): string {
	return mkdtempSync(join(tmpdir(), "quality-kit-"));
}

/** Stub scripts: named steps exit 1; others exit 0. */
function writeStubs(
	dir: string,
	rels: readonly string[],
	failing: ReadonlySet<string>,
): void {
	for (const rel of rels) {
		const path = join(dir, rel);
		mkdirSync(join(path, ".."), { recursive: true });
		const name = rel.split("/").pop()!.replace(/\.sh$/, "");
		const exit = failing.has(name) ? 1 : 0;
		writeFileSync(path, `#!/usr/bin/env bash\necho "stub ${name}"\nexit ${exit}\n`);
		chmodSync(path, 0o755);
	}
}

function placeGateLib(target: string): void {
	const quality = join(target, "tools/quality");
	mkdirSync(quality, { recursive: true });
	writeFileSync(
		join(quality, "gate-lib.sh"),
		readFileSync(
			join(kitRoot, "languages/shared/templates/tools/quality/gate-lib.sh"),
			"utf8",
		),
	);
}

test("dart gate: two independent failures both appear in the summary", () => {
	const target = tempTarget();
	placeGateLib(target);
	const quality = join(target, "tools/quality");
	mkdirSync(join(quality, "dart"), { recursive: true });
	const gateSrc = join(
		kitRoot,
		"languages/dart/templates/tools/quality/dart/gate.sh",
	);
	const gate = join(quality, "dart/gate.sh");
	writeFileSync(gate, readFileSync(gateSrc, "utf8"));
	chmodSync(gate, 0o755);

	writeStubs(
		target,
		[
			"tools/quality/dart/run-format.sh",
			"tools/quality/dart/run-analyze.sh",
			"tools/quality/run-secret-scan.sh",
			"tools/quality/dart/run-deps.sh",
		],
		new Set(["run-format", "run-analyze"]),
	);

	const result = spawnSync(gate, ["fast"], {
		cwd: target,
		encoding: "utf8",
	});
	const output = `${result.stdout}${result.stderr}`;

	assert.equal(result.status, 1, output);
	assert.match(output, /# gate:fast FAILED: format analyze$/m);
	assert.match(output, /==> format/);
	assert.match(output, /==> analyze/);
	assert.match(output, /==> secrets/);
	assert.match(output, /==> deps/);
});

test("js-ts gate: two independent failures both appear in the summary", () => {
	const target = tempTarget();
	placeGateLib(target);
	mkdirSync(join(target, "tools/quality/js-ts"), { recursive: true });
	const gateSrc = join(
		kitRoot,
		"languages/js-ts/templates/tools/quality/js-ts/gate.sh",
	);
	const gate = join(target, "tools/quality/js-ts/gate.sh");
	writeFileSync(gate, readFileSync(gateSrc, "utf8"));
	chmodSync(gate, 0o755);

	writeFileSync(
		join(target, "package.json"),
		JSON.stringify({
			name: "x",
			private: true,
			scripts: {
				lint: "exit 1",
				"lint:secrets": "exit 0",
				"lint:graph": "exit 1",
				"lint:complexity": "exit 0",
				typecheck: "exit 0",
			},
		}),
	);
	symlinkSync(join(kitRoot, "node_modules"), join(target, "node_modules"));

	const result = spawnSync("bash", [gate, "fast"], {
		cwd: target,
		encoding: "utf8",
		env: {
			...process.env,
			pnpm_config_verify_deps_before_run: "false",
		},
	});
	const output = `${result.stdout}${result.stderr}`;

	assert.equal(result.status, 1, output);
	assert.match(output, /# gate:fast FAILED: lint graph$/m);
	assert.match(output, /==> lint/);
	assert.match(output, /==> secrets/);
	assert.match(output, /==> graph/);
	assert.match(output, /==> complexity/);
	assert.match(output, /==> typecheck/);
});

test("js-ts + python: gate:fast passes fragment scripts into the Host gate runner", () => {
	const target = tempTarget();
	writeFileSync(
		join(target, "package.json"),
		JSON.stringify({ name: "x", dependencies: { lodash: "4" } }),
	);
	writeFileSync(join(target, "main.py"), "print(1)\n");

	const state = desiredState(target, ["js-ts", "python"]);
	const gateFast = state.packageJson!.scripts["gate:fast"]!;
	assert.match(gateFast, /tools\/quality\/js-ts\/gate\.sh/);
	assert.match(gateFast, /\bfast\b/);
	assert.match(gateFast, /\blint:py\b/);
	assert.doesNotMatch(gateFast, /&&\s*pnpm\s+lint:py/);
});

test("REFERENCE.md documents the Host gate contract", () => {
	const ref = readFileSync(join(kitRoot, "REFERENCE.md"), "utf8");
	assert.match(ref, /Host gate contract/i);
	assert.match(ref, /every step/i);
	assert.match(ref, /FAILED:/);
});
