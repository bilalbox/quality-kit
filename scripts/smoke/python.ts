import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { kitRoot } from "../kit-fs";
import { mergeAgentsMd, sh } from "./run";
import type { HostSmoke } from "./types";

/** First src/<pkg>/ directory from a `uv init` layout. */
function packageDir(target: string): string | null {
	const src = join(target, "src");
	if (!existsSync(src)) return null;
	for (const name of readdirSync(src)) {
		if (existsSync(join(src, name, "__init__.py"))) return name;
	}
	return null;
}

/** uv init greenfield + python Host Post-apply. */
export const pythonSmoke: HostSmoke = {
	tools: ["uv", "betterleaks", "osv-scanner", "lefthook", "git"],
	scaffold(target) {
		const name = basename(target).replace(/[^a-z0-9_]/g, "_");
		const projectName = /^[a-z]/.test(name) ? name : `smoke_${name}`;
		sh(dirname(target), ["uv", "init", "--name", projectName, target]);
		if (!existsSync(join(target, "AGENTS.md"))) {
			writeFileSync(join(target, "AGENTS.md"), "# Smoke\n");
		}
	},
	wire(target) {
		// Self-merge kit tool tables into the scaffold pyproject.
		const kitPy = join(
			kitRoot,
			"languages/python/templates/pyproject.toml",
		);
		const dest = join(target, "pyproject.toml");
		const current = readFileSync(dest, "utf8");
		if (!current.includes("[tool.ruff]")) {
			const prefix = current.endsWith("\n") ? "" : "\n";
			appendFileSync(dest, prefix + readFileSync(kitPy, "utf8"));
		}

		const pkg = packageDir(target);
		if (!pkg) {
			throw new Error("smoke python: expected uv init src/<pkg>/ layout");
		}
		writeFileSync(
			join(target, "tach.toml"),
			[
				"# Refined for smoke; forbid_circular_dependencies stays on.",
				"exact = true",
				"forbid_circular_dependencies = true",
				'source_roots = ["src"]',
				"",
				"[[modules]]",
				`path = "${pkg}"`,
				"depends_on = []",
				"",
			].join("\n"),
		);
		writeFileSync(join(target, "vulture_whitelist.py"), "# smoke whitelist\n");

		sh(target, ["uv", "add", "--dev", "pytest"]);
		sh(target, ["mkdir", "-p", "tests"]);
		// Cover the scaffold entrypoint so greenfield floor (80) passes.
		writeFileSync(
			join(target, "tests", "test_smoke.py"),
			[
				`from ${pkg} import main`,
				"",
				"",
				"def test_smoke() -> None:",
				"    main()",
				"",
			].join("\n"),
		);

		mergeAgentsMd(target);
		sh(target, ["lefthook", "install"]);
		sh(target, ["./tools/quality/python/run-format.sh", "--fix"]);
		// Refresh lock hashes after seed edits.
		sh(kitRoot, [
			"pnpm",
			"exec",
			"tsx",
			"scripts/apply.ts",
			"--target",
			target,
			"--packs",
			"python",
		]);
	},
	gate: [["./tools/quality/gate.sh", "full"]],
};
