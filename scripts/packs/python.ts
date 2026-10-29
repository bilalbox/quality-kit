import { join } from "node:path";
import { packTemplatesRoot, readText } from "../kit-fs";
import type { Contribution, Pack, Placement } from "./types";
import { walkFiles } from "./walk";

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

export const pythonPack: Pack = {
	id: "python",
	kind: "fragment",
	detect(target: string): boolean {
		return walkFiles(target, 4, (name) => name.endsWith(".py"));
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
