/**
 * Idempotent copy-in of quality-kit templates by language pack.
 * Builds Desired state, then writes missing files / merges package.json.
 *
 * Usage: pnpm apply -- --target /path/to/repo [--packs a,b] [--python] [--force-scripts]
 */

import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	copyIfMissing,
	desiredState,
	ensureDir,
	missingMarkers,
	refuseCollisions,
	resolvePacks,
	resolveTarget,
	sourceLabel,
	templatePath,
	type DesiredState,
	type Placement,
} from "./lib";
import { LOCK_FILE, recordOwned } from "./lock-file";

function mergePackageJson(
	target: string,
	state: DesiredState,
	forceScripts: boolean,
): void {
	const want = state.packageJson;
	if (!want) return;

	const pkgPath = join(target, "package.json");
	if (!existsSync(pkgPath)) {
		console.error("No package.json in target; create one first.");
		process.exit(2);
	}
	const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
		scripts?: Record<string, string>;
		devDependencies?: Record<string, string>;
		"lint-staged"?: Record<string, string[]>;
		engines?: { node?: string };
	};

	pkg.scripts ??= {};
	for (const [name, value] of Object.entries(want.scripts)) {
		const existed = Object.hasOwn(pkg.scripts, name);
		if (!existed || forceScripts) {
			pkg.scripts[name] = value;
			console.log(`  script ${existed ? "set" : "add"}  ${name}`);
		} else if (pkg.scripts[name] !== value) {
			console.log(
				`  script skip  ${name} (exists: ${pkg.scripts[name]}; pass --force-scripts to replace)`,
			);
		}
	}

	pkg.devDependencies ??= {};
	for (const [name, version] of Object.entries(want.devDependencies)) {
		if (!(name in pkg.devDependencies)) {
			pkg.devDependencies[name] = version;
			console.log(`  dep add     ${name}@${version}`);
		} else {
			console.log(`  dep skip    ${name}@${pkg.devDependencies[name]}`);
		}
	}

	if (!pkg["lint-staged"]) {
		pkg["lint-staged"] = want.lintStaged;
		console.log("  lint-staged added");
	} else {
		console.log("  lint-staged skip (exists)");
	}

	pkg.engines ??= {};
	if (!pkg.engines.node) {
		pkg.engines.node = want.enginesNode;
		console.log(`  engines.node set ${want.enginesNode}`);
	}

	writeFileSync(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`);
}

function packageRootLabel(targetRel: string): { root: string; file: string } {
	const normalized = targetRel.replace(/\\/g, "/");
	const idx = normalized.lastIndexOf("/");
	if (idx === -1) return { root: ".", file: normalized };
	return {
		root: normalized.slice(0, idx),
		file: normalized.slice(idx + 1),
	};
}

/** Copy a Placement if missing; a merge-into fragment is skipped once its dest is merged. */
function place(target: string, p: Placement): "copied" | "skipped" | "merged" {
	if (
		p.kind === "merge-into" &&
		p.mergeInto.dest !== p.targetRel &&
		missingMarkers(target, p.mergeInto).length === 0
	) {
		return "merged";
	}
	const dest = join(target, p.targetRel);
	if (p.content !== undefined) {
		if (existsSync(dest)) return "skipped";
		ensureDir(dest);
		writeFileSync(dest, p.content);
		if (p.executable) chmodSync(dest, 0o755);
		return "copied";
	}
	const result = copyIfMissing(templatePath(p), dest);
	if (result === "copied" && p.executable) chmodSync(dest, 0o755);
	return result === "copied" ? "copied" : "skipped";
}

function placementLabel(p: Placement): string {
	return p.kind === "merge-into" && p.mergeInto.dest !== p.targetRel
		? `${p.targetRel} → ${p.mergeInto.dest}`
		: p.targetRel;
}

function main(): void {
	const argv = process.argv.slice(2);
	const target = resolveTarget(argv);
	const forceScripts = argv.includes("--force-scripts");

	if (!existsSync(target)) {
		console.error(`Target not found: ${target}`);
		process.exit(2);
	}

	const packs = resolvePacks(target, argv);
	const state = desiredState(target, packs);
	refuseCollisions(state);
	const placements = [...state.rootPlacements, ...state.packagePlacements];

	console.log(`# quality-kit apply → ${target}`);
	console.log(`Packs: ${packs.length ? packs.join(", ") : "(none)"}`);
	console.log("");

	if (placements.length === 0) {
		console.log("## files");
		console.log("  (no templates for selected packs — stub or empty)");
		console.log("");
		if (!packs.includes("js-ts") && !packs.includes("dart")) {
			console.log(
				"Nothing to apply. Add a pack with templates (e.g. js-ts).",
			);
			return;
		}
	}

	console.log("## files");
	for (const p of state.rootPlacements) {
		const result = place(target, p);
		console.log(`  ${result.padEnd(8)} [${sourceLabel(p)}] ${placementLabel(p)}`);
	}

	if (state.packagePlacements.length > 0) {
		console.log("");
		console.log("## dart package files");
		for (const p of state.packagePlacements) {
			const result = place(target, p);
			const { root, file } = packageRootLabel(p.targetRel);
			console.log(`  ${result.padEnd(8)} [${root}] ${file}`);
		}
	} else if (packs.includes("dart")) {
		console.log("");
		console.log("## dart package files");
		console.log(
			"  (no package roots found — set quality-kit.dart.json roots)",
		);
	}

	const lock = recordOwned(target, placements);
	console.log("");
	console.log("## lock file");
	console.log(
		`  wrote    ${LOCK_FILE} (kit ${lock.kitRevision?.slice(0, 12) ?? "revision unknown"}, ${Object.keys(lock.files).length} owned files)`,
	);

	if (state.packageJson) {
		console.log("");
		console.log("## package.json");
		mergePackageJson(target, state, forceScripts);
	}

	for (const { pack, steps } of state.nextSteps) {
		console.log("");
		console.log(`Next (see languages/${pack}/MODULE.md):`);
		steps.forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
	}
}

main();
