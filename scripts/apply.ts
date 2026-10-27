/**
 * Idempotent copy-in of quality-kit templates.
 * - Copies missing files only (never overwrites existing config)
 * - Merges package.json scripts / devDependencies / lint-staged
 * - Seeds empty complexity + rev-dep baselines when missing
 *
 * Usage: pnpm apply -- --target /path/to/repo [--python] [--force-scripts]
 *
 * --python: include Python templates even if no .py detected
 * --force-scripts: overwrite matching script keys with kit values
 */

import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import {
	COPY_PATHS,
	copyIfMissing,
	expectedDevDeps,
	expectedLintStaged,
	expectedScripts,
	hasPython,
	PYTHON_COPY_PATHS,
	resolveTarget,
	templatesRoot,
} from "./lib";

function mergePackageJson(
	target: string,
	withPy: boolean,
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
	const wantScripts = expectedScripts(withPy);
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

	// Compose gate:fast with lint:py when Python present and gate:fast was just kit-default
	if (withPy && pkg.scripts["gate:fast"] === wantScripts["gate:fast"]) {
		pkg.scripts["gate:fast"] =
			"pnpm lint && pnpm lint:graph && pnpm lint:complexity && pnpm typecheck && pnpm lint:py";
		console.log("  script set  gate:fast (+ lint:py)");
	}

	pkg.devDependencies ??= {};
	const wantDeps = expectedDevDeps();
	for (const [name, version] of Object.entries(wantDeps)) {
		if (!(name in pkg.devDependencies)) {
			pkg.devDependencies[name] = version;
			console.log(`  dep add     ${name}@${version}`);
		} else {
			console.log(`  dep skip    ${name}@${pkg.devDependencies[name]}`);
		}
	}

	if (!pkg["lint-staged"]) {
		pkg["lint-staged"] = expectedLintStaged();
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
	const forcePython = argv.includes("--python");
	const forceScripts = argv.includes("--force-scripts");

	if (!existsSync(target)) {
		console.error(`Target not found: ${target}`);
		process.exit(2);
	}

	const withPy = forcePython || hasPython(target);
	const paths = [...COPY_PATHS, ...(withPy ? PYTHON_COPY_PATHS : [])];

	console.log(`# quality-kit apply → ${target}`);
	console.log(`Python templates: ${withPy ? "yes" : "no"}`);
	console.log("");

	console.log("## files");
	for (const rel of paths) {
		const src = join(templatesRoot, rel);
		const dest = join(target, rel);
		const result = copyIfMissing(src, dest);
		console.log(`  ${result.padEnd(8)} ${rel}`);
		if (result === "copied" && rel.endsWith(".sh")) {
			chmodSync(dest, 0o755);
		}
	}

	console.log("");
	console.log("## package.json");
	mergePackageJson(target, withPy, forceScripts);

	console.log("");
	console.log("Next:");
	console.log("  1. Adjust rev-dep.config.json entry points / moduleBoundaries");
	console.log("  2. If pnpm-workspace.yaml already existed, merge allowBuilds: esbuild");
	console.log("  3. pnpm install");
	console.log("  4. Seed complexity: pnpm lint:complexity -- --update");
	console.log(
		"  5. Seed rev-dep:    pnpm lint:graph -- --update-snapshot  (creates .rev-dep.baseline.json + .rev-dep.duplicates.json; do not hand-write them)",
	);
	console.log("  6. Merge AGENTS.quality.md into AGENTS.md");
	if (withPy) {
		console.log("  7. Refine tach.toml modules; uvx vulture@2.16 --make-whitelist");
	}
}

main();
