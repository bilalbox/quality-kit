import { type PlacementKindDecl, placeFiles } from "./placements";
import type { PackId, Placement } from "./types";

/** languages/shared/templates/, composed into every Host Pack. */
const SHARED_FILES: Record<string, PlacementKindDecl> = {
	".betterleaks.toml": "owned",
	".betterleaksignore": "seed",
	".github/actions/setup-betterleaks/action.yml": "owned",
	".github/actions/check-baseline-growth/action.yml": "owned",
	".github/actions/setup-osv-scanner/action.yml": "owned",
	"osv-scanner.toml": "seed",
	"baselines/coverage.json": "seed",
	"tools/quality/install-betterleaks.sh": "owned",
	"tools/quality/install-osv-scanner.sh": "owned",
	"tools/quality/run-secret-scan.sh": "owned",
	"tools/quality/check-baseline-growth.sh": "owned",
	"tools/quality/run-vuln-scan.sh": "owned",
	"tools/quality/run-coverage-ratchet.sh": "owned",
	"tools/quality/ratchets/compare.py": "owned",
	"tools/quality/ratchets/compare.ts": "owned",
	"tools/quality/ratchets/run-tool.ts": "owned",
	"tools/quality/ratchets/ratchet-contract.test.sh": "owned",
	"tools/quality/ratchets/fixtures/baseline-green.json": "owned",
	"tools/quality/ratchets/fixtures/baseline-scored.json": "owned",
	"tools/quality/ratchets/fixtures/baseline-stale.json": "owned",
	"tools/quality/ratchets/fixtures/baseline-coverage.json": "owned",
	"tools/quality/ratchets/fixtures/baseline-coverage-empty.json": "owned",
	"tools/quality/ratchets/fixtures/findings-green.json": "owned",
	"tools/quality/ratchets/fixtures/findings-novel.json": "owned",
	"tools/quality/ratchets/fixtures/findings-regression.json": "owned",
	"tools/quality/ratchets/fixtures/findings-stale.json": "owned",
	"tools/quality/ratchets/fixtures/findings-coverage-ok.json": "owned",
	"tools/quality/ratchets/fixtures/findings-coverage-drop.json": "owned",
	"tools/quality/ratchets/fixtures/findings-coverage-below-floor.json": "owned",
};

/** The shared layer as Placements contributed by `host`. */
export function sharedPlacements(host: PackId): Placement[] {
	return placeFiles(host, SHARED_FILES).map((p) => ({ ...p, shared: true }));
}

/** Where a Placement (or its finding) comes from, for apply/audit output. */
export function sourceLabel(p: { pack: PackId; shared?: true }): string {
	return p.shared ? "shared" : p.pack;
}
