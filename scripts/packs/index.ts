import { dartPack } from "./dart";
import { jsTsPack } from "./js-ts";
import { kotlinAndroidPack } from "./kotlin-android";
import { pythonPack } from "./python";
import { rustPack } from "./rust";
import { PACK_IDS, type Pack, type PackId } from "./types";

export { PACK_IDS, type Pack, type PackId, type PackKind, type Placement, type Contribution, type PackageJsonContribution } from "./types";
export { resolveDartRoots } from "./dart";

export const PACKS: Record<PackId, Pack> = {
	"js-ts": jsTsPack,
	python: pythonPack,
	rust: rustPack,
	dart: dartPack,
	"kotlin-android": kotlinAndroidPack,
};

export function detectPacks(target: string): PackId[] {
	const found: PackId[] = [];
	for (const id of PACK_IDS) {
		if (PACKS[id].detect(target)) found.push(id);
	}
	return found;
}
