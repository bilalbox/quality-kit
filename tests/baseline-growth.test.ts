import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { desiredState } from "../scripts/desired-state";
import { kitRoot, languagesRoot, placementContent } from "../scripts/kit-fs";
import type { PackId } from "../scripts/packs";
import { git } from "./wired-target";

const SCRIPT = join(
	languagesRoot,
	"shared/templates/tools/quality/check-baseline-growth.sh",
);

const HOSTS = ["js-ts", "dart", "kotlin-android"] as const satisfies PackId[];

function tempRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), "quality-kit-bg-"));
	git(dir, "init", "-q");
	git(dir, "config", "user.email", "kit@example.com");
	git(dir, "config", "user.name", "kit");
	git(dir, "config", "commit.gpgsign", "false");
	return dir;
}

function write(repo: string, rel: string, body: string): void {
	const abs = join(repo, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, body);
}

function commitAll(repo: string, message: string): void {
	git(repo, "add", "-A");
	git(repo, "commit", "-q", "-m", message);
}

function check(
	repo: string,
	opts: { base: string; allow?: boolean; env?: NodeJS.ProcessEnv } = {
		base: "HEAD~1",
	},
) {
	const args = [SCRIPT, "--base", opts.base, "--repo-root", repo];
	if (opts.allow) args.push("--allow");
	const res = spawnSync("bash", args, {
		cwd: repo,
		encoding: "utf8",
		env: { ...process.env, ...opts.env },
	});
	return { status: res.status ?? 1, output: res.stdout + res.stderr };
}

test("baseline-growth: adding a complexity finding id fails and prints it", () => {
	const repo = tempRepo();
	write(
		repo,
		"baselines/complexity.json",
		`${JSON.stringify({ version: 1, findings: [{ id: "a", score: 1 }] }, null, "\t")}\n`,
	);
	commitAll(repo, "base");
	write(
		repo,
		"baselines/complexity.json",
		`${JSON.stringify(
			{
				version: 1,
				findings: [
					{ id: "a", score: 1 },
					{ id: "b", score: 2 },
				],
			},
			null,
			"\t",
		)}\n`,
	);
	commitAll(repo, "grow");
	const { status, output } = check(repo, { base: "HEAD~1" });
	assert.equal(status, 1, output);
	assert.match(output, /baselines\/complexity\.json/);
	assert.match(output, /\bb\b/);
});

test("baseline-growth: removing rows passes", () => {
	const repo = tempRepo();
	write(
		repo,
		"baselines/complexity.json",
		`${JSON.stringify(
			{
				version: 1,
				findings: [
					{ id: "a", score: 1 },
					{ id: "b", score: 2 },
				],
			},
			null,
			"\t",
		)}\n`,
	);
	commitAll(repo, "base");
	write(
		repo,
		"baselines/complexity.json",
		`${JSON.stringify({ version: 1, findings: [{ id: "a", score: 1 }] }, null, "\t")}\n`,
	);
	commitAll(repo, "shrink");
	const { status, output } = check(repo, { base: "HEAD~1" });
	assert.equal(status, 0, output);
});

test("baseline-growth: score increase on an existing id fails", () => {
	const repo = tempRepo();
	write(
		repo,
		"baselines/biome-diagnostics.json",
		`${JSON.stringify({ version: 1, findings: [{ id: "f|r", score: 1 }] }, null, "\t")}\n`,
	);
	commitAll(repo, "base");
	write(
		repo,
		"baselines/biome-diagnostics.json",
		`${JSON.stringify({ version: 1, findings: [{ id: "f|r", score: 3 }] }, null, "\t")}\n`,
	);
	commitAll(repo, "worse");
	const { status, output } = check(repo, { base: "HEAD~1" });
	assert.equal(status, 1, output);
	assert.match(output, /f\|r/);
});

test("baseline-growth: coverage score decrease fails (decrease counts as growth)", () => {
	const repo = tempRepo();
	write(
		repo,
		"baselines/coverage.json",
		`${JSON.stringify(
			{
				version: 1,
				worseWhen: "lower",
				floor: 80,
				findings: [{ id: ".", score: 90 }],
			},
			null,
			"\t",
		)}\n`,
	);
	commitAll(repo, "base");
	write(
		repo,
		"baselines/coverage.json",
		`${JSON.stringify(
			{
				version: 1,
				worseWhen: "lower",
				floor: 80,
				findings: [{ id: ".", score: 85 }],
			},
			null,
			"\t",
		)}\n`,
	);
	commitAll(repo, "drop");
	const { status, output } = check(repo, { base: "HEAD~1" });
	assert.equal(status, 1, output);
	assert.match(output, /baselines\/coverage\.json/);
	assert.match(output, /90(?:\.0)? → 85(?:\.0)?/);
});

test("baseline-growth: coverage score increase passes", () => {
	const repo = tempRepo();
	write(
		repo,
		"baselines/coverage.json",
		`${JSON.stringify(
			{
				version: 1,
				worseWhen: "lower",
				floor: 80,
				findings: [{ id: ".", score: 85 }],
			},
			null,
			"\t",
		)}\n`,
	);
	commitAll(repo, "base");
	write(
		repo,
		"baselines/coverage.json",
		`${JSON.stringify(
			{
				version: 1,
				worseWhen: "lower",
				floor: 80,
				findings: [{ id: ".", score: 92 }],
			},
			null,
			"\t",
		)}\n`,
	);
	commitAll(repo, "raise");
	const { status, output } = check(repo, { base: "HEAD~1" });
	assert.equal(status, 0, output);
});

test("baseline-growth: .betterleaksignore and vulture whitelist grow fails", () => {
	const repo = tempRepo();
	write(repo, ".betterleaksignore", "# c\nold:line:1\n");
	write(repo, "vulture_whitelist.py", "# c\nold\n");
	commitAll(repo, "base");
	write(repo, ".betterleaksignore", "# c\nold:line:1\nnew:line:2\n");
	write(repo, "vulture_whitelist.py", "# c\nold\nnew\n");
	commitAll(repo, "grow");
	const { status, output } = check(repo, { base: "HEAD~1" });
	assert.equal(status, 1, output);
	assert.match(output, /\.betterleaksignore/);
	assert.match(output, /new:line:2/);
	assert.match(output, /vulture_whitelist\.py/);
	assert.match(output, /\bnew\b/);
});

test("baseline-growth: detekt and lint baseline xml growth fails", () => {
	const repo = tempRepo();
	write(
		repo,
		"app/detekt-baseline.xml",
		`<?xml version="1.0"?>
<SmellBaseline>
  <CurrentIssues>
    <ID>LongMethod:A.kt</ID>
  </CurrentIssues>
</SmellBaseline>
`,
	);
	write(
		repo,
		"app/lint-baseline.xml",
		`<?xml version="1.0" encoding="UTF-8"?>
<issues format="6" by="lint">
  <issue id="UnusedResources" message="x">
    <location file="a.xml" line="1" column="2"/>
  </issue>
</issues>
`,
	);
	commitAll(repo, "base");
	write(
		repo,
		"app/detekt-baseline.xml",
		`<?xml version="1.0"?>
<SmellBaseline>
  <CurrentIssues>
    <ID>LongMethod:A.kt</ID>
    <ID>MagicNumber:B.kt</ID>
  </CurrentIssues>
</SmellBaseline>
`,
	);
	write(
		repo,
		"app/lint-baseline.xml",
		`<?xml version="1.0" encoding="UTF-8"?>
<issues format="6" by="lint">
  <issue id="UnusedResources" message="x">
    <location file="a.xml" line="1" column="2"/>
  </issue>
  <issue id="NewApi" message="y">
    <location file="b.kt" line="3" column="4"/>
  </issue>
</issues>
`,
	);
	commitAll(repo, "grow");
	const { status, output } = check(repo, { base: "HEAD~1" });
	assert.equal(status, 1, output);
	assert.match(output, /MagicNumber:B\.kt/);
	assert.match(output, /NewApi/);
});

test("baseline-growth: rev-dep snapshots grow fails", () => {
	const repo = tempRepo();
	write(
		repo,
		".rev-dep.baseline.json",
		`${JSON.stringify(
			{
				schemaVersion: "1.0",
				workspaces: {
					".": {
						"unused-exports": [{ exportName: "old", filePath: "a.ts" }],
					},
				},
			},
			null,
			"\t",
		)}\n`,
	);
	write(
		repo,
		".rev-dep.duplicates.json",
		`${JSON.stringify(
			{
				schemaVersion: "1.0",
				duplications: [{ hash: "aaa", files: ["a.ts", "b.ts"] }],
			},
			null,
			"\t",
		)}\n`,
	);
	commitAll(repo, "base");
	write(
		repo,
		".rev-dep.baseline.json",
		`${JSON.stringify(
			{
				schemaVersion: "1.0",
				workspaces: {
					".": {
						"unused-exports": [
							{ exportName: "old", filePath: "a.ts" },
							{ exportName: "neu", filePath: "b.ts" },
						],
					},
				},
			},
			null,
			"\t",
		)}\n`,
	);
	write(
		repo,
		".rev-dep.duplicates.json",
		`${JSON.stringify(
			{
				schemaVersion: "1.0",
				duplications: [
					{ hash: "aaa", files: ["a.ts", "b.ts"] },
					{ hash: "bbb", files: ["c.ts", "d.ts"] },
				],
			},
			null,
			"\t",
		)}\n`,
	);
	commitAll(repo, "grow");
	const { status, output } = check(repo, { base: "HEAD~1" });
	assert.equal(status, 1, output);
	assert.match(output, /\.rev-dep\.baseline\.json/);
	assert.match(output, /neu/);
	assert.match(output, /\.rev-dep\.duplicates\.json/);
	assert.match(output, /bbb/);
});

test("baseline-growth: osv-scanner.toml ignore ids are watched when present", () => {
	const repo = tempRepo();
	write(
		repo,
		"osv-scanner.toml",
		`[[IgnoredVulns]]
id = "GHSA-old"
reason = "legacy"
`,
	);
	commitAll(repo, "base");
	write(
		repo,
		"osv-scanner.toml",
		`[[IgnoredVulns]]
id = "GHSA-old"
reason = "legacy"

[[IgnoredVulns]]
id = "GHSA-new"
reason = "temporary"
`,
	);
	commitAll(repo, "grow");
	const { status, output } = check(repo, { base: "HEAD~1" });
	assert.equal(status, 1, output);
	assert.match(output, /osv-scanner\.toml/);
	assert.match(output, /GHSA-new/);
});

test("baseline-growth: --allow and ALLOW_BASELINE_GROWTH override pass", () => {
	const repo = tempRepo();
	write(repo, ".betterleaksignore", "old\n");
	commitAll(repo, "base");
	write(repo, ".betterleaksignore", "old\nnew\n");
	commitAll(repo, "grow");
	assert.equal(check(repo, { base: "HEAD~1", allow: true }).status, 0);
	assert.equal(
		check(repo, {
			base: "HEAD~1",
			env: { ALLOW_BASELINE_GROWTH: "1" },
		}).status,
		0,
	);
});

test("baseline-growth: shared layer places the script and action once per Host", () => {
	const files = [
		"tools/quality/check-baseline-growth.sh",
		".github/actions/check-baseline-growth/action.yml",
	];
	for (const host of HOSTS) {
		const state = desiredState(mkdtempSync(join(tmpdir(), "quality-kit-")), [
			host,
		]);
		for (const rel of files) {
			const placed = state.rootPlacements.filter((p) => p.targetRel === rel);
			assert.equal(placed.length, 1, `${host} ${rel}`);
			assert.equal(placed[0]!.shared, true);
		}
	}
});

for (const host of HOSTS) {
	test(`baseline-growth: ${host} CI runs the shared check on pull_request`, () => {
		const state = desiredState(mkdtempSync(join(tmpdir(), "quality-kit-")), [
			host,
		]);
		const ci = state.rootPlacements.find(
			(p) => p.targetRel === ".github/workflows/ci.yml",
		);
		const yml = placementContent(ci!) ?? "";
		assert.match(yml, /uses: \.\/\.github\/actions\/check-baseline-growth/);
		assert.match(yml, /allow-baseline-growth/);
	});
}

test("baseline-growth: action skips when allow-baseline-growth label is set", () => {
	const action = readFileSync(
		join(
			languagesRoot,
			"shared/templates/.github/actions/check-baseline-growth/action.yml",
		),
		"utf8",
	);
	assert.match(action, /check-baseline-growth\.sh/);
	const ci = readFileSync(
		join(kitRoot, "languages/js-ts/templates/.github/workflows/ci.yml"),
		"utf8",
	);
	assert.match(
		ci,
		/!contains\(.*allow-baseline-growth|contains\(.*allow-baseline-growth/,
	);
});
