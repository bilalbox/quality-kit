import { existsSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { packTemplatesRoot, readText } from "../kit-fs";
import { type FileKind, placeFiles } from "./placements";
import { postApplySteps } from "./post-apply";
import { sharedPlacements } from "./shared";
import type { Contribution, Pack, PackId, PackKind } from "./types";
import { PYTHON_HELPER_DIRS, walkFiles } from "./walk";
import { hooksInstalledProbe, LEFTHOOK } from "./wiring";

/** Always placed (Host and Fragment). */
const COMMON_FILES: Record<string, FileKind> = {
	"pyproject.toml": {
		dest: "pyproject.toml",
		markers: ["[tool.ruff]", "[tool.basedpyright]", "[tool.vulture]"],
	},
	"tach.toml": "seed",
	"vulture_whitelist.py": "seed",
};

/** Host-only scripts / CI / hooks inputs (namespaced under tools/quality/python/). */
const HOST_FILES: Record<string, FileKind> = {
	".betterleaks.d/python.toml": "owned",
	".github/actions/setup-uv/action.yml": "owned",
	".github/actions/python-quality-gate/action.yml": "owned",
	"tools/quality/python/gate.sh": "owned",
	"tools/quality/python/run-format.sh": "owned",
	"tools/quality/python/run-lint.sh": "owned",
	"tools/quality/python/run-types.sh": "owned",
	"tools/quality/python/run-boundaries.sh": "owned",
	"tools/quality/python/run-deadcode.sh": "owned",
	"tools/quality/python/run-test.sh": "owned",
	"tools/quality/python/collect-coverage.sh": "owned",
};

/** True when a path segment is a known helper-script directory. */
function underPythonHelperDir(target: string, filePath: string): boolean {
	const rel = relative(target, dirname(filePath));
	if (!rel || rel === ".") return false;
	return rel.split(sep).some((seg) => PYTHON_HELPER_DIRS.has(seg));
}

/**
 * Product Python signal: root pyproject, or `.py` outside helper dirs.
 * Incidental Flutter/repo scripts under tool|tools|scripts|bin are ignored.
 */
export function detectPythonProduct(target: string): boolean {
	if (existsSync(join(target, "pyproject.toml"))) return true;
	return walkFiles(target, 4, (name, path) => {
		if (!name.endsWith(".py")) return false;
		if (basename(path) === "vulture_whitelist.py") return false;
		return !underPythonHelperDir(target, path);
	});
}

/**
 * Effective role for this selection: Fragment onto js-ts; Host otherwise.
 * Canonical Pack.kind stays "host".
 */
export function packRole(selected: readonly PackId[]): PackKind {
	return selected.includes("js-ts") ? "fragment" : "host";
}

function fragmentContribution(): Contribution {
	const scripts = JSON.parse(
		readText(join(packTemplatesRoot("python"), "package.scripts.json")),
	) as Record<string, string>;

	return {
		rootPlacements: placeFiles("python", COMMON_FILES),
		packagePlacements: [],
		packageJson: {
			scripts,
			gateFragments: ["lint:py"],
		},
		nextSteps: postApplySteps("python"),
		probes: [],
	};
}

function hostContribution(): Contribution {
	return {
		rootPlacements: [
			...placeFiles("python", COMMON_FILES),
			...placeFiles("python", HOST_FILES),
			...sharedPlacements("python"),
		],
		packagePlacements: [],
		nextSteps: postApplySteps("python"),
		probes: [hooksInstalledProbe(LEFTHOOK)],
	};
}

export const pythonPack: Pack = {
	id: "python",
	kind: "host",
	detect(target: string): boolean {
		return detectPythonProduct(target);
	},
	contribute(_target: string, selected: readonly PackId[]): Contribution {
		return packRole(selected) === "fragment"
			? fragmentContribution()
			: hostContribution();
	},
};
