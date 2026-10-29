import { existsSync } from "node:fs";
import { join } from "node:path";
import { packTemplatesRoot, readText } from "../kit-fs";
import type { Contribution, Pack, Placement } from "./types";

const COPY_PATHS = [
	"biome.json",
	"biome.complexity.json",
	"tsconfig.base.json",
	"rev-dep.config.json",
	".editorconfig",
	".betterleaks.toml",
	".betterleaksignore",
	".npmrc",
	".nvmrc",
	".gitignore",
	"pnpm-workspace.yaml",
	".husky/pre-commit",
	".husky/pre-push",
	".github/workflows/ci.yml",
	".github/actions/setup-pnpm/action.yml",
	".github/actions/quality-gate/action.yml",
	"scripts/ratchets/compare.ts",
	"scripts/ratchets/run-tool.ts",
	"scripts/ratchets/run-complexity.ts",
	"scripts/run-rev-dep.ts",
	"scripts/run-secret-scan.ts",
	"baselines/complexity.json",
	"tests/ratchets/ratchet-contract.test.sh",
	"tests/ratchets/fixtures/baseline-green.json",
	"tests/ratchets/fixtures/baseline-scored.json",
	"tests/ratchets/fixtures/baseline-stale.json",
	"tests/ratchets/fixtures/findings-green.json",
	"tests/ratchets/fixtures/findings-novel.json",
	"tests/ratchets/fixtures/findings-regression.json",
	"tests/ratchets/fixtures/findings-stale.json",
	"AGENTS.quality.md",
] as const;

function manifest(name: string): string {
	return join(packTemplatesRoot("js-ts"), name);
}

function rootPlacements(): Placement[] {
	return COPY_PATHS.map((rel) => ({
		pack: "js-ts" as const,
		templateRel: rel,
		targetRel: rel,
		executable: rel.endsWith(".sh") ? true : undefined,
	}));
}

export const jsTsPack: Pack = {
	id: "js-ts",
	kind: "host",
	detect(target: string): boolean {
		const pkgPath = join(target, "package.json");
		if (!existsSync(pkgPath)) return false;
		try {
			const pkg = JSON.parse(readText(pkgPath)) as {
				dependencies?: Record<string, string>;
				devDependencies?: Record<string, string>;
			};
			const deps = {
				...(pkg.dependencies ?? {}),
				...(pkg.devDependencies ?? {}),
			};
			// Stub package.json + orphan lockfile (common in Flutter repos) → not js-ts.
			return Object.keys(deps).length > 0;
		} catch {
			return true;
		}
	},
	contribute(_target: string, _selected: readonly string[]): Contribution {
		const scripts = JSON.parse(readText(manifest("package.scripts.json"))) as Record<
			string,
			string
		>;
		const devDependencies = JSON.parse(
			readText(manifest("package.devDependencies.json")),
		) as Record<string, string>;
		const lintStaged = JSON.parse(
			readText(manifest("package.lint-staged.json")),
		) as Record<string, string[]>;

		return {
			rootPlacements: rootPlacements(),
			packagePlacements: [],
			packageJson: {
				scripts,
				devDependencies,
				lintStaged,
				enginesNode: ">=24.0.0 <25",
			},
		};
	},
};
