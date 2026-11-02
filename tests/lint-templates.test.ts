import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { kitRoot } from "../scripts/kit-fs";

function onPath(bin: string): boolean {
	return !spawnSync(bin, ["--version"]).error;
}

/** Linters are optional locally but must be present in CI. */
function needs(...bins: string[]): { skip: string | false } {
	const missing = bins.filter((bin) => !onPath(bin));
	if (missing.length === 0 || process.env.CI) return { skip: false };
	return { skip: `${missing.join(", ")} not on PATH` };
}

function kitFixture(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), "quality-kit-lint-"));
	for (const [rel, body] of Object.entries(files)) {
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), body);
	}
	return root;
}

function lintTemplates(root: string) {
	const result = spawnSync(
		join(kitRoot, "node_modules/.bin/tsx"),
		[join(kitRoot, "scripts/lint-templates.ts"), "--root", root],
		{ encoding: "utf8" },
	);
	return { status: result.status, output: result.stdout + result.stderr };
}

const CLEAN_SH = '#!/usr/bin/env bash\nset -euo pipefail\necho "ok"\n';

function workflowUsingLocalAction(input: string): string {
	return `name: CI
on:
  pull_request:
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
        with:
          ${input}: strict
`;
}

const LOCAL_ACTION = `name: Setup
description: Setup
inputs:
  mode:
    description: Mode
    required: false
runs:
  using: composite
  steps:
    - run: echo setup
      shell: bash
`;

test("lint-templates: clean templates pass", needs("shellcheck", "actionlint"), () => {
	const root = kitFixture({
		"languages/demo/templates/tools/quality/lib.sh":
			'#!/usr/bin/env bash\n# shellcheck disable=SC2034\nquality_greeting="hi"\n',
		"languages/demo/templates/tools/quality/gate.sh": `#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "\${SCRIPT_DIR}/lib.sh"
echo "\${quality_greeting}"
`,
		"languages/demo/templates/tools/ok.sh": CLEAN_SH,
		"languages/demo/templates/.husky/pre-commit": "pnpm exec lint-staged\n",
		"languages/demo/templates/.github/workflows/ci.yml":
			workflowUsingLocalAction("mode"),
		"languages/demo/templates/.github/actions/setup/action.yml": LOCAL_ACTION,
	});
	const { status, output } = lintTemplates(root);
	assert.equal(status, 0, output);
});

test("lint-templates: shellcheck finding in a template script fails", needs("shellcheck"), () => {
	const root = kitFixture({
		"languages/demo/templates/tools/ok.sh": CLEAN_SH,
		"languages/demo/templates/tools/bad.sh": "#!/usr/bin/env bash\necho $1\n",
	});
	const { status, output } = lintTemplates(root);
	assert.equal(status, 1);
	assert.match(output, /bad\.sh/);
	assert.match(output, /SC2086/);
});

test("lint-templates: shebang-less husky hooks are linted as POSIX sh", needs("shellcheck"), () => {
	const root = kitFixture({
		"languages/demo/templates/.husky/pre-commit": "pnpm lint\n",
		"languages/demo/templates/.husky/pre-push":
			'if [[ -n "${CI:-}" ]]; then pnpm gate; fi\n',
	});
	const { status, output } = lintTemplates(root);
	assert.equal(status, 1);
	assert.match(output, /pre-push/);
	assert.match(output, /SC3010/);
	assert.doesNotMatch(output, /SC2148/);
});

test("lint-templates: template workflows are checked against the Pack's own local actions", needs("actionlint"), () => {
	const root = kitFixture({
		"languages/demo/templates/.github/workflows/ci.yml":
			workflowUsingLocalAction("flavour"),
		"languages/demo/templates/.github/actions/setup/action.yml": LOCAL_ACTION,
	});
	const { status, output } = lintTemplates(root);
	assert.equal(status, 1);
	assert.match(output, /languages\/demo\/templates\/\.github\/workflows\/ci\.yml/);
	assert.match(output, /input "flavour" is not defined/);
});

test("lint-templates: template workflows are checked against shared-layer actions", needs("actionlint"), () => {
	const root = kitFixture({
		"languages/demo/templates/.github/workflows/ci.yml":
			workflowUsingLocalAction("flavour"),
		"languages/shared/templates/.github/actions/setup/action.yml": LOCAL_ACTION,
	});
	const { status, output } = lintTemplates(root);
	assert.equal(status, 1, output);
	assert.match(output, /input "flavour" is not defined/);
});

test("lint-templates: the kit's own workflows are checked", needs("actionlint"), () => {
	const root = kitFixture({
		".github/workflows/ci.yml": `name: CI
on:
  pull_requests:
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - run: echo ok
`,
	});
	spawnSync("git", ["init", "-q"], { cwd: root });
	const { status, output } = lintTemplates(root);
	assert.equal(status, 1);
	assert.match(output, /^\.github\/workflows\/ci\.yml:/m);
});
