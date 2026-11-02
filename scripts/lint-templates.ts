/**
 * Lint the kit's templates: shellcheck on template shell scripts and husky
 * hooks, actionlint on the kit's own workflows, each Pack's template
 * workflows, and every multi-Host composed CI workflow.
 *
 * Usage: pnpm lint:templates [-- --root /path/to/kit]
 */

import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { kitRoot } from "./kit-fs";
import {
	CI_HOST_IDS,
	composeCiWorkflow,
	type CiHostId,
} from "./packs/ci";

const SHARED_TEMPLATES = join("languages", "shared", "templates");

function resolveRoot(argv: readonly string[]): string {
	const idx = argv.indexOf("--root");
	return idx === -1 ? kitRoot : resolve(argv[idx + 1]!);
}

/** `languages/<pack>/templates` dirs (relative to root) that exist. */
function templateDirs(root: string): string[] {
	const languages = join(root, "languages");
	if (!existsSync(languages)) return [];
	return readdirSync(languages)
		.sort()
		.map((pack) => join("languages", pack, "templates"))
		.filter((dir) => existsSync(join(root, dir)));
}

function templateFiles(root: string, dirs: readonly string[]): string[] {
	return dirs
		.flatMap((dir) =>
			readdirSync(join(root, dir), { recursive: true, encoding: "utf8" }).map(
				(rel) => join(dir, rel),
			),
		)
		.sort();
}

/** Husky runs hook files (no shebang) with `sh`. */
function isHuskyHook(root: string, rel: string): boolean {
	return (
		basename(dirname(rel)) === ".husky" && statSync(join(root, rel)).isFile()
	);
}

/**
 * Run a linter in cwd, printing its output with `.github/` paths re-rooted
 * under `prefix`. Exits 2 when the linter is not installed.
 */
function run(
	bin: string,
	args: readonly string[],
	cwd: string,
	prefix = "",
): boolean {
	const result = spawnSync(bin, args, { cwd, encoding: "utf8" });
	if (result.error) {
		console.error(`${bin} not runnable (${result.error.message}); install it`);
		process.exit(2);
	}
	const output = (result.stdout + result.stderr).replace(
		/^\.github\//gm,
		`${prefix}.github/`,
	);
	process.stdout.write(output);
	return result.status === 0;
}

function copyGithubTree(src: string, destGithub: string): void {
	if (!existsSync(src)) return;
	cpSync(src, destGithub, { recursive: true });
}

/**
 * actionlint resolves `uses: ./.github/actions/…` from the git root (and
 * skips actions it cannot find), so each Pack's `.github` is linted inside its
 * own throwaway repo together with the shared layer's `.github` every Host
 * composes.
 */
function lintPackWorkflows(root: string, dir: string): boolean {
	const scratch = mkdtempSync(join(tmpdir(), "quality-kit-actionlint-"));
	for (const src of [SHARED_TEMPLATES, dir]) {
		copyGithubTree(join(root, src, ".github"), join(scratch, ".github"));
	}
	spawnSync("git", ["init", "-q"], { cwd: scratch });
	return run("actionlint", [], scratch, `${dir}/`);
}

/** Host Packs under `root` that still ship a composition-input ci.yml. */
function presentCiHosts(root: string): CiHostId[] {
	return CI_HOST_IDS.filter((id) =>
		existsSync(
			join(root, "languages", id, "templates", ".github", "workflows", "ci.yml"),
		),
	);
}

/** Every multi-Host combination in selection order (pairs, then all). */
function multiHostCombos(hosts: readonly CiHostId[]): CiHostId[][] {
	const combos: CiHostId[][] = [];
	for (let i = 0; i < hosts.length; i++) {
		for (let j = i + 1; j < hosts.length; j++) {
			combos.push([hosts[i]!, hosts[j]!]);
		}
	}
	if (hosts.length > 2) combos.push([...hosts]);
	return combos;
}

/**
 * Materialize a composed workflow with every selected Host's actions (and the
 * shared layer) so actionlint resolves namespaced quality-gate uses.
 */
function lintComposedWorkflow(
	root: string,
	hosts: readonly CiHostId[],
): boolean {
	const scratch = mkdtempSync(join(tmpdir(), "quality-kit-composed-ci-"));
	copyGithubTree(
		join(root, SHARED_TEMPLATES, ".github"),
		join(scratch, ".github"),
	);
	for (const id of hosts) {
		copyGithubTree(
			join(root, "languages", id, "templates", ".github", "actions"),
			join(scratch, ".github", "actions"),
		);
	}
	const yml = composeCiWorkflow(hosts, {
		languagesRoot: join(root, "languages"),
	});
	const workflow = join(scratch, ".github", "workflows", "ci.yml");
	mkdirSync(dirname(workflow), { recursive: true });
	writeFileSync(workflow, yml);
	spawnSync("git", ["init", "-q"], { cwd: scratch });
	const label = `composed:${hosts.join("+")}/`;
	return run("actionlint", [], scratch, label);
}

function main(): void {
	const root = resolveRoot(process.argv.slice(2));
	const dirs = templateDirs(root);
	const files = templateFiles(root, dirs);
	const scripts = files.filter((rel) => rel.endsWith(".sh"));
	const huskyHooks = files.filter((rel) => isHuskyHook(root, rel));
	let ok = true;
	if (scripts.length > 0) {
		ok = run("shellcheck", ["-x", "-P", "SCRIPTDIR", ...scripts], root) && ok;
	}
	if (huskyHooks.length > 0) {
		ok = run("shellcheck", ["-s", "sh", ...huskyHooks], root) && ok;
	}
	if (existsSync(join(root, ".github/workflows"))) {
		ok = run("actionlint", [], root) && ok;
	}
	for (const dir of dirs) {
		if (existsSync(join(root, dir, ".github/workflows"))) {
			ok = lintPackWorkflows(root, dir) && ok;
		}
	}
	for (const hosts of multiHostCombos(presentCiHosts(root))) {
		ok = lintComposedWorkflow(root, hosts) && ok;
	}
	process.exit(ok ? 0 : 1);
}

main();
