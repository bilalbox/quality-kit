import { existsSync } from "node:fs";
import { join } from "node:path";
import { packTemplatesRoot, readText } from "../kit-fs";
import { type FileKind, placeFiles } from "./placements";
import { postApplySteps } from "./post-apply";
import { sharedPlacements } from "./shared";
import { lefthookHostsOf } from "./local";
import type { Contribution, Pack, PackId, WiringProbe } from "./types";
import { HUSKY, LEFTHOOK, hooksInstalledProbe } from "./wiring";

/** Shared root files (.editorconfig, AGENTS) are composed; husky only when no lefthook Host. */
const ROOT_FILES: Record<string, FileKind> = {
	"biome.json": "owned",
	"biome.complexity.json": "seed",
	"tsconfig.base.json": "owned",
	"rev-dep.config.json": "seed",
	".betterleaks.d/js-ts.toml": "owned",
	".npmrc": { dest: ".npmrc", markers: ["engine-strict=true"] },
	".nvmrc": "owned",
	".gitignore": "seed",
	"pnpm-workspace.yaml": {
		dest: "pnpm-workspace.yaml",
		markers: ["esbuild: true"],
	},
	".github/actions/setup-pnpm/action.yml": "owned",
	".github/actions/js-ts-quality-gate/action.yml": "owned",
	"scripts/ratchets/compare.ts": "owned",
	"scripts/ratchets/run-tool.ts": "owned",
	"scripts/ratchets/run-complexity.ts": "owned",
	"scripts/ratchets/run-biome.ts": "owned",
	"scripts/run-rev-dep.ts": "owned",
	"baselines/complexity.json": "seed",
	"baselines/biome-diagnostics.json": "seed",
	"tests/ratchets/ratchet-contract.test.sh": "owned",
	"tests/ratchets/fixtures/baseline-green.json": "owned",
	"tests/ratchets/fixtures/baseline-scored.json": "owned",
	"tests/ratchets/fixtures/baseline-stale.json": "owned",
	"tests/ratchets/fixtures/findings-green.json": "owned",
	"tests/ratchets/fixtures/findings-novel.json": "owned",
	"tests/ratchets/fixtures/findings-regression.json": "owned",
	"tests/ratchets/fixtures/findings-stale.json": "owned",
};

const HUSKY_FILES: Record<string, FileKind> = {
	".husky/pre-commit": "owned",
	".husky/pre-push": "owned",
};

function withLefthookHost(selected: readonly PackId[]): boolean {
	return lefthookHostsOf(selected).length > 0;
}

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

const TEST_PROBE: WiringProbe = {
	label: "package.json has a test script",
	check: (target) =>
		hasTestScript(target)
			? []
			: [
					{
						fix: 'add a "test" script to package.json (`pnpm gate` ends with `pnpm test`)',
					},
				],
};

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
	contribute(_target: string, selected: readonly PackId[]): Contribution {
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

		// With a lefthook Host, composed lefthook.yml owns hooks (incl. lint-staged).
		const husky = withLefthookHost(selected)
			? []
			: placeFiles("js-ts", HUSKY_FILES);
		const hooksProbe = withLefthookHost(selected)
			? hooksInstalledProbe(LEFTHOOK)
			: hooksInstalledProbe(HUSKY);

		return {
			rootPlacements: [
				...placeFiles("js-ts", ROOT_FILES),
				...husky,
				...sharedPlacements("js-ts"),
			],
			packagePlacements: [],
			packageJson: {
				scripts,
				devDependencies,
				lintStaged,
				enginesNode: ">=24.0.0 <25",
			},
			nextSteps: postApplySteps("js-ts"),
			probes: [hooksProbe, TEST_PROBE],
		};
	},
};
