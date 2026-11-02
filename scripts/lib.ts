/**
 * Shared CLI plumbing for apply/audit adapters.
 * Pack adapters: ./packs · Desired state: ./desired-state · FS helpers: ./kit-fs
 */

export {
	copyIfMissing,
	ensureDir,
	kitRoot,
	languagesRoot,
	normalize,
	packTemplatesRoot,
	readText,
	relToKit,
} from "./kit-fs";

export {
	detectPacks,
	PACK_IDS,
	PACKS,
	resolveDartRoots,
	type Pack,
	type PackId,
	type PackKind,
} from "./packs";

export {
	desiredState,
	diffAgainst,
	type DesiredState,
	type DiffReport,
	type DriftKind,
	type FileFinding,
	type PlacementCollision,
} from "./desired-state";

import type { DesiredState } from "./desired-state";
import { detectPacks, PACK_IDS, type PackId } from "./packs";

/** Exit 2 listing every colliding path when selected Packs overlap. */
export function refuseCollisions(state: DesiredState): void {
	if (state.collisions.length === 0) return;
	console.error(
		"Refusing: selected Packs place the same Target paths with different content:",
	);
	for (const c of state.collisions) {
		console.error(`  ${c.targetRel}  (${c.packs.join(", ")})`);
	}
	console.error(
		"Combining these Host Packs in one Target is not supported yet; select one Host Pack with --packs.",
	);
	process.exit(2);
}

export function resolveTarget(argv: string[]): string {
	const idx = argv.indexOf("--target");
	if (idx !== -1 && argv[idx + 1]) return argv[idx + 1]!;
	const positional = argv.find(
		(a, i) =>
			!a.startsWith("-") &&
			argv[i - 1] !== "--target" &&
			argv[i - 1] !== "--packs",
	);
	if (positional) return positional;
	return process.cwd();
}

/** Parse --packs and --python from argv; merge with detection when --packs omitted. */
export function resolvePacks(target: string, argv: string[]): PackId[] {
	const packsIdx = argv.indexOf("--packs");
	let packs: PackId[];
	if (packsIdx !== -1 && argv[packsIdx + 1]) {
		const raw = argv[packsIdx + 1]!.split(",").map((s) => s.trim());
		packs = [];
		for (const id of raw) {
			if (!(PACK_IDS as readonly string[]).includes(id)) {
				console.error(
					`Unknown pack "${id}". Valid: ${PACK_IDS.join(", ")}`,
				);
				process.exit(2);
			}
			if (!packs.includes(id as PackId)) packs.push(id as PackId);
		}
	} else {
		packs = detectPacks(target);
	}
	if (argv.includes("--python") && !packs.includes("python")) {
		packs.push("python");
	}
	return packs;
}
