import { existsSync } from "node:fs";
import { join } from "node:path";
import { packTemplatesRoot, readText } from "../kit-fs";
import { AGENTS_MD, type FileKind, placeFiles } from "./placements";
import { postApplySteps } from "./post-apply";
import type { Contribution, Pack, WiringProbe } from "./types";
import { HUSKY, hooksInstalledProbe } from "./wiring";

const ROOT_FILES: Record<string, FileKind> = {
	"biome.json": "owned",
	"biome.complexity.json": "seed",
	"tsconfig.base.json": "owned",
	"rev-dep.config.json": "seed",
	".editorconfig": "owned",
	".betterleaks.toml": "owned",
	".betterleaksignore": "seed",
	".npmrc": { dest: ".npmrc", markers: ["engine-strict=true"] },
	".nvmrc": "owned",
	".gitignore": "seed",
	"pnpm-workspace.yaml": {
		dest: "pnpm-workspace.yaml",
		markers: ["esbuild: true"],
	},
	".husky/pre-commit": "owned",
	".husky/pre-push": "owned",
	".github/workflows/ci.yml": "owned",
	".github/actions/setup-pnpm/action.yml": "owned",
	".github/actions/quality-gate/action.yml": "owned",
	"scripts/ratchets/compare.ts": "owned",
	"scripts/ratchets/run-tool.ts": "owned",
	"scripts/ratchets/run-complexity.ts": "owned",
	"scripts/run-rev-dep.ts": "owned",
	"scripts/run-secret-scan.ts": "owned",
	"baselines/complexity.json": "seed",
	"tests/ratchets/ratchet-contract.test.sh": "owned",
	"tests/ratchets/fixtures/baseline-green.json": "owned",
	"tests/ratchets/fixtures/baseline-scored.json": "owned",
	"tests/ratchets/fixtures/baseline-stale.json": "owned",
	"tests/ratchets/fixtures/findings-green.json": "owned",
	"tests/ratchets/fixtures/findings-novel.json": "owned",
	"tests/ratchets/fixtures/findings-regression.json": "owned",
	"tests/ratchets/fixtures/findings-stale.json": "owned",
	"AGENTS.quality.md": AGENTS_MD,
};

function hasTestScript(target: string): boolean {
	const pkgPath = join(target, "package.json");
	if (!existsSync(pkgPath)) return false;
	try {
		const pkg = JSON.parse(readText(pkgPath)) as {
			scripts?: Record<string, string>;
		};
		return Boolean(pkg.scripts?.test);
	} catch {
		return false;
	}
}

const PROBES: readonly WiringProbe[] = [
	hooksInstalledProbe(HUSKY),
	{
		label: "package.json has a test script",
		check: (target) =>
			hasTestScript(target)
				? []
				: [
						{
							fix: 'add a "test" script to package.json (`pnpm gate` ends with `pnpm test`)',
						},
					],
	},
];

function manifest(name: string): string {
	return join(packTemplatesRoot("js-ts"), name);
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
			rootPlacements: placeFiles("js-ts", ROOT_FILES),
			packagePlacements: [],
			packageJson: {
				scripts,
				devDependencies,
				lintStaged,
				enginesNode: ">=24.0.0 <25",
			},
			nextSteps: postApplySteps("js-ts"),
			probes: PROBES,
		};
	},
};
