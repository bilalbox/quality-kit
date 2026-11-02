/**
 * Update stale owned files to the current templates; list the rest for a manual merge.
 *
 * Usage: pnpm run upgrade -- --target /path/to/repo [--packs a,b] [--python]
 */

import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	copyIfMissing,
	desiredState,
	diffAgainst,
	ensureDir,
	refuseCollisions,
	resolvePacks,
	resolveTarget,
	sourceLabel,
	templatePath,
	type FileStatus,
} from "./lib";
import { LOCK_FILE, recordOwned } from "./lock-file";

function main(): void {
	const argv = process.argv.slice(2);
	const target = resolveTarget(argv);
	const dryRun = argv.includes("--dry-run");
	if (!existsSync(target)) {
		console.error(`Target not found: ${target}`);
		process.exit(2);
	}

	const packs = resolvePacks(target, argv);
	const state = desiredState(target, packs);
	refuseCollisions(state);
	const placements = [...state.rootPlacements, ...state.packagePlacements];
	const report = diffAgainst(target, state);
	if (report.lock !== "present") {
		const problem = report.lock === "missing" ? "missing" : "unreadable";
		console.error(
			`${LOCK_FILE} ${problem}: cannot tell stale owned files from customized ones; run apply first.`,
		);
		process.exit(2);
	}

	console.log(`# quality-kit upgrade → ${target}`);
	console.log(`Packs: ${packs.length ? packs.join(", ") : "(none)"}`);
	console.log("");
	const byStatus = (status: FileStatus) =>
		placements.filter((_, i) => report.files[i]?.status === status);
	const stale = byStatus("stale");
	const byHand = [...byStatus("customized"), ...byStatus("drift")];

	console.log("## owned files");
	if (stale.length === 0) console.log("  (none stale)");
	for (const p of stale) {
		if (!dryRun) {
			const dest = join(target, p.targetRel);
			if (p.content !== undefined) {
				ensureDir(dest);
				writeFileSync(dest, p.content);
			} else {
				copyIfMissing(templatePath(p), dest, true);
			}
			if (p.executable) chmodSync(dest, 0o755);
		}
		console.log(
			`  ${dryRun ? "would update" : "updated   "} [${sourceLabel(p)}] ${p.targetRel}`,
		);
	}

	if (!dryRun) recordOwned(target, placements);

	if (byHand.length > 0) {
		console.log("");
		console.log('## Merge by hand (see SKILL.md "Drift playbook")');
		for (const p of byHand) {
			const status = report.files[placements.indexOf(p)]!.status;
			console.log(`  ${status.padEnd(10)} [${sourceLabel(p)}] ${p.targetRel}`);
		}
	}

	const missing = byStatus("missing");
	if (missing.length > 0) {
		console.log("");
		console.log("## Missing (upgrade never creates files; run apply)");
		for (const p of missing) {
			console.log(`  missing    [${sourceLabel(p)}] ${p.targetRel}`);
		}
	}
}

main();
