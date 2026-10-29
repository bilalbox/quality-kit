/**
 * Read-only conformance + drift report vs Desired state.
 *
 * Usage: pnpm audit -- --target /path/to/repo [--packs a,b] [--python]
 */

import { existsSync } from "node:fs";
import {
	desiredState,
	diffAgainst,
	PACKS,
	resolvePacks,
	resolveTarget,
	type PackId,
} from "./lib";

/** Host that currently absorbs python Fragment package.json / gate pieces. */
const PYTHON_HOST: PackId = "js-ts";

function formatPackRoles(packs: readonly PackId[]): string {
	if (packs.length === 0) return "(none)";
	return packs
		.map((id) => {
			const kind = PACKS[id].kind;
			return `${id} (${kind})`;
		})
		.join(", ");
}

function warnOrphanFragments(packs: readonly PackId[]): void {
	const hasPython = packs.includes("python");
	const hasJsTs = packs.includes(PYTHON_HOST);
	const hasDart = packs.includes("dart");
	if (!hasPython || hasJsTs) return;

	console.log("## Warnings");
	console.log(
		`  python is a Fragment Pack for the ${PYTHON_HOST} Host; without ${PYTHON_HOST}, templates still apply but gate scripts are not wired.`,
	);
	if (hasDart) {
		console.log(
			"  Flutter/Dart Targets with incidental tool/*.py: prefer --packs dart (python detect ignores helper dirs).",
		);
	}
	console.log(
		"  Force product Python with --packs …,python or --python when needed.",
	);
	console.log("");
}

function main(): void {
	const argv = process.argv.slice(2);
	const target = resolveTarget(argv);
	if (!existsSync(target)) {
		console.error(`Target not found: ${target}`);
		process.exit(2);
	}

	const packs = resolvePacks(target, argv);
	const state = desiredState(target, packs);
	const report = diffAgainst(target, state);

	console.log(`# quality-kit audit: ${target}`);
	console.log(`Packs: ${formatPackRoles(packs)}`);
	console.log("");

	warnOrphanFragments(packs);

	const byKind = {
		missing: report.files.filter((r) => r.kind === "missing"),
		match: report.files.filter((r) => r.kind === "match"),
		drift: report.files.filter((r) => r.kind === "drift"),
	};

	console.log(`## Files (${report.files.length})`);
	console.log(`- match: ${byKind.match.length}`);
	console.log(`- missing: ${byKind.missing.length}`);
	console.log(`- drift: ${byKind.drift.length}`);
	for (const r of byKind.missing)
		console.log(`  missing  [${r.pack}] ${r.path}`);
	for (const r of byKind.drift)
		console.log(`  drift    [${r.pack}] ${r.path}`);
	if (report.files.length === 0) {
		console.log("  (no templates for selected packs — stub or empty)");
	}

	if (state.packageJson) {
		console.log("");
		console.log("## package.json scripts");
		if (report.scripts.length === 0) {
			console.log("  missing package.json");
		}
		for (const s of report.scripts) {
			if (s.kind === "missing") console.log(`  missing  ${s.name}`);
			else if (s.kind === "drift")
				console.log(`  drift    ${s.name}: ${s.got}`);
			else console.log(`  match    ${s.name}`);
		}

		console.log("");
		console.log("## package.json devDependencies");
		for (const d of report.devDependencies) {
			if (d.kind === "missing")
				console.log(`  missing  ${d.name} (want ${d.want})`);
			else console.log(`  present  ${d.name}@${d.got}`);
		}

		console.log("");
		console.log("## lint-staged");
		if (report.lintStaged === "missing") console.log("  missing");
		else if (report.lintStaged === "match") console.log("  match");
		else if (report.lintStaged === "drift") console.log("  drift");

		console.log("");
		console.log("## engines / nvmrc");
		console.log(
			report.nvmrc !== null
				? `  .nvmrc: ${report.nvmrc}`
				: "  .nvmrc missing",
		);
		console.log(
			report.enginesNode
				? `  engines.node: ${report.enginesNode}`
				: "  engines.node missing",
		);
	}

	if (report.dartRoots !== null) {
		console.log("");
		console.log("## dart roots");
		console.log(
			report.dartRoots.length
				? `  ${report.dartRoots.join(", ")}`
				: "  (none — set quality-kit.dart.json roots)",
		);
	}

	const gaps = byKind.missing.length + byKind.drift.length;
	const scriptGaps = report.scripts.filter((s) => s.kind !== "match").length;
	process.exit(gaps + scriptGaps > 0 ? 1 : 0);
}

main();
