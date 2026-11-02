import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { editJson, mergeAgentsMd, sh } from "./run";
import type { SmokeRecipe } from "./types";

type Pkg = {
	scripts?: Record<string, string>;
	devDependencies?: Record<string, string>;
};

/** Vite vanilla-ts greenfield + js-ts Post-apply. */
export const jsTsSmoke: SmokeRecipe = {
	tools: ["pnpm", "betterleaks", "osv-scanner", "git"],
	scaffold(target) {
		sh(dirname(target), [
			"pnpm",
			"create",
			"vite@latest",
			basename(target),
			"--template",
			"vanilla-ts",
			"--no-interactive",
		]);
		// Gate ends with `pnpm test`; Vite has none. Any non-empty script satisfies the probe.
		editJson<Pkg>(join(target, "package.json"), (pkg) => {
			pkg.scripts ??= {};
			pkg.scripts.test = 'node -e "process.exit(0)"';
		});
		// Vite ships no AGENTS.md; merge-into needs a destination.
		if (!existsSync(join(target, "AGENTS.md"))) {
			writeFileSync(join(target, "AGENTS.md"), "# Smoke\n");
		}
	},
	wire(target) {
		mergeAgentsMd(target);
		sh(target, ["pnpm", "install"]);
		// Seed ratchets under adopter env (CI refuses --update).
		sh(target, ["pnpm", "lint:complexity", "--", "--update"]);
		sh(target, ["pnpm", "lint:graph", "--", "--update-snapshot"]);
		// One-off Biome cleanup (may exit non-zero on non-auto-fixables), then baseline.
		try {
			sh(target, ["pnpm", "fix"]);
		} catch {
			/* leftover diagnostics are baselined next */
		}
		sh(target, ["pnpm", "lint", "--", "--update"]);
		// Ensure engine-strict / esbuild markers landed (self-merge seeds).
		if (existsSync(join(target, "pnpm-workspace.yaml"))) {
			const text = readFileSync(join(target, "pnpm-workspace.yaml"), "utf8");
			if (!text.includes("esbuild: true")) {
				writeFileSync(
					join(target, "pnpm-workspace.yaml"),
					`${text.trimEnd()}\nallowBuilds:\n  esbuild: true\n`,
				);
			}
		}
	},
	gate: [
		["pnpm", "gate"],
		["pnpm", "test:ratchets"],
	],
};
