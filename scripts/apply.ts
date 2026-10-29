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
	packTemplatesRoot,
	resolvePacks,
	resolveTarget,
	type DesiredState,
} from "./lib";

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
		const src = join(packTemplatesRoot(p.pack), p.templateRel);
		const dest = join(target, p.targetRel);
		const result = copyIfMissing(src, dest);
		console.log(`  ${result.padEnd(8)} [${p.pack}] ${p.targetRel}`);
		if (result === "copied" && p.executable) {
			chmodSync(dest, 0o755);
		}
	}

	if (state.packagePlacements.length > 0) {
		console.log("");
		console.log("## dart package files");
		for (const p of state.packagePlacements) {
			const src = join(packTemplatesRoot(p.pack), p.templateRel);
			const dest = join(target, p.targetRel);
			const result = copyIfMissing(src, dest);
			const { root, file } = packageRootLabel(p.targetRel);
			console.log(`  ${result.padEnd(8)} [${root}] ${file}`);
			if (result === "copied" && p.executable) {
				chmodSync(dest, 0o755);
			}
		}
	} else if (packs.includes("dart")) {
		console.log("");
		console.log("## dart package files");
		console.log(
			"  (no package roots found — set quality-kit.dart.json roots)",
		);
	}

	if (state.packageJson) {
		console.log("");
		console.log("## package.json");
		mergePackageJson(target, state, forceScripts);

		console.log("");
		console.log("Next (see languages/js-ts/MODULE.md):");
		console.log(
			"  1. Adjust rev-dep.config.json entry points / moduleBoundaries",
		);
		console.log(
			"  2. If pnpm-workspace.yaml already existed, merge allowBuilds: esbuild",
		);
		console.log("  3. pnpm install");
		console.log("  4. Seed complexity: pnpm lint:complexity -- --update");
		console.log(
			"  5. Seed rev-dep:    pnpm lint:graph -- --update-snapshot  (creates .rev-dep.baseline.json + .rev-dep.duplicates.json; do not hand-write them)",
		);
		console.log("  6. Merge AGENTS.quality.md into AGENTS.md");
		if (packs.includes("python")) {
			console.log(
				"  7. Refine tach.toml modules; uvx vulture@2.16 --make-whitelist",
			);
		}
	}

	if (packs.includes("dart")) {
		console.log("");
		console.log("Next (see languages/dart/MODULE.md):");
		console.log(
			'  1. Set quality-kit.dart.json roots (e.g. ["app"]) and flutterEnv if needed',
		);
		console.log(
			"  2. Install Betterleaks v1.9.0+ and lefthook on the host",
		);
		console.log("  3. lefthook install");
		console.log(
			"  4. If Makefile already existed, wire gate / gate-fast to tools/quality/gate.sh",
		);
		console.log("  5. Merge AGENTS.quality.md into AGENTS.md");
		console.log("  6. ./tools/quality/gate.sh full");
	}
}

main();
