import { join } from "node:path";
import type { MergeInto, PackId, Placement } from "./types";

/** Per-path Placement kind declaration: `"owned"`, `"seed"`, or a merge-into destination. */
export type PlacementKindDecl = "owned" | "seed" | MergeInto;

/** `AGENTS.quality.md` is merged into the Target's `AGENTS.md`. */
export const AGENTS_MD: MergeInto = {
	dest: "AGENTS.md",
	markers: ["## Definition of Done (Mandatory Gate)"],
};

/**
 * Map template relpaths 1:1 onto the Target (optionally under `targetDir`),
 * marking `.sh` files executable.
 */
export function placeFiles(
	pack: PackId,
	files: Readonly<Record<string, PlacementKindDecl>>,
	dirs: { templateDir?: string; targetDir?: string } = {},
): Placement[] {
	const under = (dir: string | undefined, rel: string) =>
		dir && dir !== "." ? join(dir, rel) : rel;
	return Object.entries(files).map(([rel, kind]) => {
		const base = {
			pack,
			templateRel: under(dirs.templateDir, rel),
			targetRel: under(dirs.targetDir, rel),
			executable: rel.endsWith(".sh") ? true : undefined,
		};
		if (typeof kind === "string") return { ...base, kind };
		return {
			...base,
			kind: "merge-into",
			mergeInto: { ...kind, dest: under(dirs.targetDir, kind.dest) },
		};
	});
}
