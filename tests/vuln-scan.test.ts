import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { desiredState } from "../scripts/desired-state";
import { kitRoot, languagesRoot, templatePath } from "../scripts/kit-fs";
import type { PackId } from "../scripts/packs";

const HOSTS = ["js-ts", "python", "dart", "kotlin-android"] as const satisfies PackId[];

const VULN_FILES = [
	"osv-scanner.toml",
	".github/actions/setup-osv-scanner/action.yml",
	"tools/quality/install-osv-scanner.sh",
	"tools/quality/run-vuln-scan.sh",
];

/** osv-scanner is optional locally but must be present in CI. */
function needsOsvScanner(): { skip: string | false } {
	const found = !spawnSync("osv-scanner", ["--version"]).error;
	if (found || process.env.CI) return { skip: false };
	return { skip: "osv-scanner not on PATH" };
}

/** OSV DB lookups need network; skip locally when unreachable (never under CI). */
function needsOsvOnline(): { skip: string | false } {
	const bin = needsOsvScanner();
	if (bin.skip) return bin;
	if (process.env.CI) return { skip: false };
	const probe = spawnSync(
		"curl",
		["-fsS", "--max-time", "5", "-o", "/dev/null", "https://osv.dev"],
		{ encoding: "utf8" },
	);
	if (probe.status === 0) return { skip: false };
	return { skip: "osv.dev unreachable" };
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

function scan(target: string) {
	const res = spawnSync(
		"bash",
		[join(target, "tools/quality/run-vuln-scan.sh")],
		{ cwd: target, encoding: "utf8", env: { ...process.env, CI: "" } },
	);
	return { status: res.status, output: res.stdout + res.stderr };
}

function write(target: string, rel: string, text: string): void {
	mkdirSync(dirname(join(target, rel)), { recursive: true });
	writeFileSync(join(target, rel), text);
}

/** Plant a pnpm lockfile that pins a known-vulnerable lodash. */
function plantVulnerablePnpm(target: string): void {
	write(
		target,
		"package.json",
		JSON.stringify({
			name: "vuln-probe",
			version: "1.0.0",
			dependencies: { lodash: "4.17.20" },
		}),
	);
	const res = spawnSync("pnpm", ["install", "--ignore-scripts"], {
		cwd: target,
		encoding: "utf8",
	});
	assert.equal(res.status, 0, res.stdout + res.stderr);
}

/** Plant a pubspec.lock that pins a known-vulnerable `http`. */
function plantVulnerablePub(target: string): void {
	write(
		target,
		"pubspec.yaml",
		`name: vuln_probe
environment:
  sdk: '>=3.0.0 <4.0.0'
dependencies:
  http: 0.13.0
`,
	);
	const res = spawnSync("dart", ["pub", "get"], {
		cwd: target,
		encoding: "utf8",
		env: {
			...process.env,
			PATH: `${process.env.HOME}/flutter/bin:${process.env.PATH}`,
		},
	});
	assert.equal(res.status, 0, res.stdout + res.stderr);
}

/** Plant a Gradle lockfile that pins known-vulnerable log4j-core. */
function plantVulnerableGradle(target: string): void {
	write(
		target,
		"gradle.lockfile",
		`# This is a Gradle generated file for dependency locking.
org.apache.logging.log4j:log4j-core:2.14.1=classpath
empty=
`,
	);
}

for (const host of HOSTS) {
	test(`vuln scan: ${host} places the osv-scanner files from the shared layer`, () => {
		const state = desiredState(mkdtempSync(join(tmpdir(), "quality-kit-")), [host]);
		for (const rel of VULN_FILES) {
			const placed = state.rootPlacements.filter((p) => p.targetRel === rel);
			assert.equal(placed.length, 1, rel);
			assert.equal(placed[0]!.shared, true);
			assert.equal(
				templatePath(placed[0]!),
				join(languagesRoot, "shared", "templates", rel),
			);
			assert.equal(
				placed[0]!.kind,
				rel === "osv-scanner.toml" ? "seed" : "owned",
				rel,
			);
		}
	});
}

for (const host of HOSTS) {
	test(`vuln scan: ${host} CI installs osv-scanner only through the shared action`, () => {
		const state = desiredState(mkdtempSync(join(tmpdir(), "quality-kit-")), [host]);
		const ci = state.rootPlacements.find(
			(p) => p.targetRel === ".github/workflows/ci.yml",
		);
		assert.match(
			readFileSync(templatePath(ci!), "utf8"),
			/uses: \.\/\.github\/actions\/setup-osv-scanner\n/,
		);
		const ownDownloads = state.rootPlacements.filter((p) => {
			if (p.shared || p.content !== undefined) return false;
			const path = templatePath(p);
			return (
				existsSync(path) &&
				readFileSync(path, "utf8").includes("osv-scanner/releases/download")
			);
		});
		assert.deepEqual(
			ownDownloads.map((p) => p.targetRel),
			[],
		);
	});
}

test("vuln scan: js-ts full gate invokes the shared vuln wrapper", () => {
	const scripts = JSON.parse(
		readFileSync(
			join(languagesRoot, "js-ts/templates/package.scripts.json"),
			"utf8",
		),
	) as Record<string, string>;
	assert.match(scripts["lint:vulns"] ?? "", /run-vuln-scan\.sh/);
	assert.match(scripts.gate ?? "", /js-ts\/gate\.sh full/);
	assert.match(scripts["gate:fast"] ?? "", /js-ts\/gate\.sh fast/);
	const gate = readFileSync(
		join(languagesRoot, "js-ts/templates/tools/quality/js-ts/gate.sh"),
		"utf8",
	);
	assert.match(
		gate,
		/\[\[ "\$\{mode\}" == "full" \]\][\s\S]*step vulns pnpm lint:vulns/,
	);
	assert.doesNotMatch(scripts["gate:fast"] ?? "", /lint:vulns/);
});

for (const host of ["python", "dart", "kotlin-android"] as const) {
	test(`vuln scan: ${host} full gate invokes the shared vuln wrapper`, () => {
		const gate = readFileSync(
			join(languagesRoot, `${host}/templates/tools/quality/${host}/gate.sh`),
			"utf8",
		);
		assert.match(gate, /run-vuln-scan\.sh/);
		// full-only: the call sits inside the full branch, or after a full-mode guard
		assert.match(
			gate,
			/mode.*full[\s\S]*run-vuln-scan\.sh|run-vuln-scan\.sh[\s\S]*mode.*full|\[\[.*"\$\{mode\}".*==.*"full"[\s\S]*run-vuln-scan/,
		);
	});
}

test("vuln scan: a Target with no lockfiles passes", needsOsvOnline(), () => {
	const { status, output } = scan(appliedTarget("js-ts"));
	assert.equal(status, 0, output);
});

test(
	"vuln scan: a known-vulnerable pnpm lockfile fails the shared wrapper",
	needsOsvOnline(),
	() => {
		const target = appliedTarget("js-ts");
		plantVulnerablePnpm(target);
		assert.equal(scan(target).status, 1);
	},
);

test(
	"vuln scan: a known-vulnerable pubspec.lock fails the shared wrapper",
	needsOsvOnline(),
	() => {
		const target = appliedTarget("dart");
		plantVulnerablePub(target);
		assert.equal(scan(target).status, 1);
	},
);

test(
	"vuln scan: a known-vulnerable gradle.lockfile fails the shared wrapper",
	needsOsvOnline(),
	() => {
		const target = appliedTarget("kotlin-android");
		plantVulnerableGradle(target);
		assert.equal(scan(target).status, 1);
	},
);

test("vuln scan: an ignore without a reason is refused", needsOsvOnline(), () => {
	const target = appliedTarget("js-ts");
	plantVulnerablePnpm(target);
	write(
		target,
		"osv-scanner.toml",
		`[[IgnoredVulns]]
id = "GHSA-29mw-wpgm-hmr9"
`,
	);
	const { status, output } = scan(target);
	assert.notEqual(status, 0, output);
	assert.match(output, /reason/i);
});

test(
	"vuln scan: ignores with id and reason are accepted",
	needsOsvOnline(),
	() => {
		const target = appliedTarget("js-ts");
		plantVulnerablePnpm(target);
		write(
			target,
			"osv-scanner.toml",
			`[[IgnoredVulns]]
id = "GHSA-29mw-wpgm-hmr9"
reason = "tracked; legacy fixture"

[[IgnoredVulns]]
id = "GHSA-35jh-r3h4-6jhm"
reason = "tracked; legacy fixture"

[[IgnoredVulns]]
id = "GHSA-f23m-r3pf-42rh"
reason = "tracked; legacy fixture"

[[IgnoredVulns]]
id = "GHSA-r5fr-rjxr-66jc"
reason = "tracked; legacy fixture"

[[IgnoredVulns]]
id = "GHSA-xxjr-mmjv-4gpg"
reason = "tracked; legacy fixture"
`,
		);
		const { status, output } = scan(target);
		assert.equal(status, 0, output);
	},
);

/** A `curl` that "downloads" a fake osv-scanner binary. */
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
printf '#!/bin/sh\\necho fake\\n' >"\${out}"
`,
		{ mode: 0o755 },
	);
	return dir;
}

test("install-osv-scanner: refuses a binary that does not match the pinned checksum", () => {
	const dest = mkdtempSync(join(tmpdir(), "quality-kit-bin-"));
	const res = spawnSync(
		"bash",
		[join(kitRoot, "languages/shared/templates/tools/quality/install-osv-scanner.sh"), dest],
		{
			encoding: "utf8",
			env: { ...process.env, PATH: `${stubCurlDir()}:${process.env.PATH}` },
		},
	);
	assert.notEqual(res.status, 0, res.stdout + res.stderr);
	assert.match(res.stderr, /checksum/i);
	assert.deepEqual(readdirSync(dest), []);
});
