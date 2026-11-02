import { type FileKind, placeFiles } from "./placements";
import type { PackId, Placement } from "./types";

/** languages/shared/templates/, composed into every Host Pack. */
const SHARED_FILES: Record<string, FileKind> = {
	".betterleaks.toml": "owned",
	".betterleaksignore": "seed",
	".github/actions/setup-betterleaks/action.yml": "owned",
	".github/actions/check-baseline-growth/action.yml": "owned",
	"tools/quality/install-betterleaks.sh": "owned",
	"tools/quality/run-secret-scan.sh": "owned",
	"tools/quality/check-baseline-growth.sh": "owned",
};

/** The shared layer as Placements contributed by `host`. */
export function sharedPlacements(host: PackId): Placement[] {
	return placeFiles(host, SHARED_FILES).map((p) => ({ ...p, shared: true }));
}

/** Where a Placement (or its finding) comes from, for apply/audit output. */
export function sourceLabel(p: { pack: PackId; shared?: true }): string {
	return p.shared ? "shared" : p.pack;
}
