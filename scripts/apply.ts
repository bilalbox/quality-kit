/**
 * Idempotent copy-in of quality-kit templates by language pack.
 * - Copies missing files only (never overwrites existing config)
 * - Merges package.json scripts / devDependencies / lint-staged when js-ts selected
 *
 * Usage: pnpm apply -- --target /path/to/repo [--packs a,b] [--python] [--force-scripts]
 *
 * --packs: override detection (comma-separated: js-ts,python,rust,dart)
 * --python: add python pack (back-compat)
 * --force-scripts: overwrite matching script keys with kit values
 */

import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import {
	composedGateFast,
	copyIfMissing,
	copyPathsForPacks,
	DART_PACKAGE_COPY_PATHS,
	expectedDevDeps,
	expectedLintStaged,
	expectedScripts,
	packTemplatesRoot,
	resolveDartRoots,
	resolvePacks,
	resolveTarget,
	type PackId,
} from "./lib";

function mergePackageJson(
	target: string,
	packs: PackId[],
	forceScripts: boolean,
): void {
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
		prepare?: string;
	};

	pkg.scripts ??= {};
	const wantScripts = expectedScripts(packs);
	const gateFast = composedGateFast(packs);
	if (gateFast) wantScripts["gate:fast"] = gateFast;

	for (const [name, value] of Object.entries(wantScripts)) {
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
	const wantDeps = expectedDevDeps(packs);
	for (const [name, version] of Object.entries(wantDeps)) {
		if (!(name in pkg.devDependencies)) {
			pkg.devDependencies[name] = version;
			console.log(`  dep add     ${name}@${version}`);
		} else {
			console.log(`  dep skip    ${name}@${pkg.devDependencies[name]}`);
		}
	}

	if (!pkg["lint-staged"]) {
		pkg["lint-staged"] = expectedLintStaged(packs);
		console.log("  lint-staged added");
	} else {
		console.log("  lint-staged skip (exists)");
	}

	pkg.engines ??= {};
	if (!pkg.engines.node) {
		pkg.engines.node = ">=24.0.0 <25";
		console.log("  engines.node set >=24.0.0 <25");
	}

	writeFileSync(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`);
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
	const entries = copyPathsForPacks(packs);

	console.log(`# quality-kit apply → ${target}`);
	console.log(`Packs: ${packs.length ? packs.join(", ") : "(none)"}`);
	console.log("");

	if (entries.length === 0) {
		console.log("## files");
		console.log("  (no templates for selected packs — stub or empty)");
		console.log("");
		if (!packs.includes("js-ts")) {
			console.log("Nothing to apply. Add a pack with templates (e.g. js-ts).");
			return;
		}
	}

	console.log("## files");
	for (const { pack, rel } of entries) {
		const src = join(packTemplatesRoot(pack), rel);
		const dest = join(target, rel);
		const result = copyIfMissing(src, dest);
		console.log(`  ${result.padEnd(8)} [${pack}] ${rel}`);
		if (result === "copied" && rel.endsWith(".sh")) {
			chmodSync(dest, 0o755);
		}
	}

	if (packs.includes("dart")) {
		console.log("");
		console.log("## dart package files");
		const roots = resolveDartRoots(target);
		if (roots.length === 0) {
			console.log("  (no package roots found — set quality-kit.dart.json roots)");
		}
		for (const root of roots) {
			for (const rel of DART_PACKAGE_COPY_PATHS) {
				const src = join(packTemplatesRoot("dart"), "package", rel);
				const dest = join(target, root === "." ? rel : join(root, rel));
				const result = copyIfMissing(src, dest);
				console.log(`  ${result.padEnd(8)} [${root}] ${rel}`);
			}
		}
	}

	if (packs.includes("js-ts")) {
		console.log("");
		console.log("## package.json");
		mergePackageJson(target, packs, forceScripts);

		console.log("");
		console.log("Next (see languages/js-ts/MODULE.md):");
		console.log("  1. Adjust rev-dep.config.json entry points / moduleBoundaries");
		console.log("  2. If pnpm-workspace.yaml already existed, merge allowBuilds: esbuild");
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
		console.log("  1. Set quality-kit.dart.json roots (e.g. [\"app\"]) and flutterEnv if needed");
		console.log("  2. Install Betterleaks v1.9.0+ and lefthook on the host");
		console.log("  3. lefthook install");
		console.log("  4. If Makefile already existed, wire gate / gate-fast to tools/quality/gate.sh");
		console.log("  5. Merge AGENTS.quality.md into AGENTS.md");
		console.log("  6. ./tools/quality/gate.sh full");
	}
}

main();
