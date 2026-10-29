import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Contribution, Pack } from "./types";

export const rustPack: Pack = {
	id: "rust",
	kind: "host",
	detect(target: string): boolean {
		return existsSync(join(target, "Cargo.toml"));
	},
	contribute(_target: string, _selected: readonly string[]): Contribution {
		return {
			rootPlacements: [],
			packagePlacements: [],
		};
	},
};
