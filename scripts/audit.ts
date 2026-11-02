/**
 * Read-only conformance + drift report vs Desired state.
 *
 * Usage: pnpm audit -- --target /path/to/repo [--packs a,b] [--python]
 */

import { existsSync } from "node:fs";
import {
	desiredState,
	diffAgainst,
	isFileGap,
	PACKS,
	refuseCollisions,
	resolvePacks,
	resolveTarget,
	type FileFinding,
	type PackId,
	type PlacementKind,
	type WiringFinding,
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

const PLACEMENT_KINDS: readonly PlacementKind[] = [
	"owned",
	"seed",
	"merge-into",
];

const KIND_NOTES: Record<PlacementKind, string> = {
	owned: "kit-owned; content must match the template",
	seed: "copied once, then Target-owned; presence (and JSON parse) only",
	"merge-into": "kit content must appear in the destination file",
};

function printKindGroup(
	kind: PlacementKind,
	findings: readonly FileFinding[],
): void {
	const counts = new Map<string, number>();
	for (const f of findings) counts.set(f.status, (counts.get(f.status) ?? 0) + 1);
	console.log("");
	console.log(`### ${kind} (${findings.length}) — ${KIND_NOTES[kind]}`);
	console.log(
		`- ${[...counts].map(([status, n]) => `${status}: ${n}`).join(", ")}`,
	);
	for (const f of findings.filter(isFileGap)) {
		const path = f.dest && f.dest !== f.path ? `${f.path} → ${f.dest}` : f.path;
		const detail = f.detail ? ` (${f.detail})` : "";
		console.log(`  ${f.status.padEnd(8)} [${f.pack}] ${path}${detail}`);
		if (f.fix) console.log(`           fix: ${f.fix}`);
	}
}

function printWiring(wiring: readonly WiringFinding[]): void {
	console.log("");
	console.log(`## Wiring (${wiring.length})`);
	for (const w of wiring) {
		const status = w.gaps.length > 0 ? "unwired" : "wired";
		console.log(`  ${status.padEnd(8)} [${w.pack}] ${w.label}`);
		for (const g of w.gaps) {
			if (g.detail) console.log(`           ${g.detail}`);
			console.log(`           fix: ${g.fix}`);
		}
	}
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
	refuseCollisions(state);
	const report = diffAgainst(target, state);

	console.log(`# quality-kit audit: ${target}`);
	console.log(`Packs: ${formatPackRoles(packs)}`);
	console.log("");

	warnOrphanFragments(packs);

	console.log(`## Files (${report.files.length})`);
	if (report.files.length === 0) {
		console.log("  (no templates for selected packs — stub or empty)");
	}
	for (const kind of PLACEMENT_KINDS) {
		const findings = report.files.filter((f) => f.kind === kind);
		if (findings.length > 0) printKindGroup(kind, findings);
	}

	if (report.wiring.length > 0) printWiring(report.wiring);

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

	const gaps = report.files.filter(isFileGap).length;
	const scriptGaps = report.scripts.filter((s) => s.kind !== "match").length;
	const wiringGaps = report.wiring.filter((w) => w.gaps.length > 0).length;
	process.exit(gaps + scriptGaps + wiringGaps > 0 ? 1 : 0);
}

main();
