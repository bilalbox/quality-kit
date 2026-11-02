/**
 * Lint the kit's templates: shellcheck on template shell scripts and husky
 * hooks, actionlint on the kit's own workflows and each Pack's template
 * workflows.
 *
 * Usage: pnpm lint:templates [-- --root /path/to/kit]
 */

import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readdirSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { kitRoot } from "./kit-fs";

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

/**
 * actionlint resolves `uses: ./.github/actions/…` from the git root (and
 * skips actions it cannot find), so each Pack's `.github` is linted inside its
 * own throwaway repo together with the shared layer's `.github` every Host
 * composes.
 */
function lintPackWorkflows(root: string, dir: string): boolean {
	const scratch = mkdtempSync(join(tmpdir(), "quality-kit-actionlint-"));
	for (const src of [SHARED_TEMPLATES, dir]) {
		const github = join(root, src, ".github");
		if (existsSync(github)) {
			cpSync(github, join(scratch, ".github"), { recursive: true });
		}
	}
	spawnSync("git", ["init", "-q"], { cwd: scratch });
	return run("actionlint", [], scratch, `${dir}/`);
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
	process.exit(ok ? 0 : 1);
}

main();
