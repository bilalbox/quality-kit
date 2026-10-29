import { existsSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { packTemplatesRoot, readText } from "../kit-fs";
import type { Contribution, Pack, Placement } from "./types";
import { PYTHON_HELPER_DIRS, walkFiles } from "./walk";

const COPY_PATHS = [
	"pyproject.toml",
	"tach.toml",
	"vulture_whitelist.py",
] as const;

function rootPlacements(): Placement[] {
	return COPY_PATHS.map((rel) => ({
		pack: "python" as const,
		templateRel: rel,
		targetRel: rel,
	}));
}

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

export const pythonPack: Pack = {
	id: "python",
	kind: "fragment",
	detect(target: string): boolean {
		return detectPythonProduct(target);
	},
	contribute(_target: string, _selected: readonly string[]): Contribution {
		const scripts = JSON.parse(
			readText(join(packTemplatesRoot("python"), "package.scripts.json")),
		) as Record<string, string>;

		return {
			rootPlacements: rootPlacements(),
			packagePlacements: [],
			packageJson: {
				scripts,
				gateFragments: ["lint:py"],
			},
		};
	},
};
