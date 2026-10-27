/**
 * Read-only conformance + drift report vs quality-kit templates.
 *
 * Usage: pnpm audit -- --target /path/to/repo
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	COPY_PATHS,
	expectedDevDeps,
	expectedLintStaged,
	expectedScripts,
	hasPython,
	PYTHON_COPY_PATHS,
	reportFile,
	resolveTarget,
	type FileReport,
} from "./lib";

function main(): void {
	const target = resolveTarget(process.argv.slice(2));
	if (!existsSync(target)) {
		console.error(`Target not found: ${target}`);
		process.exit(2);
	}

	const withPy = hasPython(target);
	const paths = [...COPY_PATHS, ...(withPy ? PYTHON_COPY_PATHS : [])];
	const reports: FileReport[] = paths.map((p) => reportFile(target, p));

	const pkgPath = join(target, "package.json");
	const pkg = existsSync(pkgPath)
		? (JSON.parse(readFileSync(pkgPath, "utf8")) as {
				scripts?: Record<string, string>;
				devDependencies?: Record<string, string>;
				"lint-staged"?: Record<string, string[]>;
				engines?: { node?: string };
			})
		: null;

	console.log(`# quality-kit audit: ${target}`);
	console.log(`Python detected: ${withPy ? "yes" : "no"}`);
	console.log("");

	const byKind = {
		missing: reports.filter((r) => r.kind === "missing"),
		match: reports.filter((r) => r.kind === "match"),
		drift: reports.filter((r) => r.kind === "drift"),
	};

	console.log(`## Files (${reports.length})`);
	console.log(`- match: ${byKind.match.length}`);
	console.log(`- missing: ${byKind.missing.length}`);
	console.log(`- drift: ${byKind.drift.length}`);
	for (const r of byKind.missing) console.log(`  missing  ${r.path}`);
	for (const r of byKind.drift) console.log(`  drift    ${r.path}`);

	console.log("");
	console.log("## package.json scripts");
	const wantScripts = expectedScripts(withPy);
	if (!pkg) {
		console.log("  missing package.json");
	} else {
		for (const [name, want] of Object.entries(wantScripts)) {
			const got = pkg.scripts?.[name];
			if (!got) console.log(`  missing  ${name}`);
			else if (got !== want) console.log(`  drift    ${name}: ${got}`);
			else console.log(`  match    ${name}`);
		}
	}

	console.log("");
	console.log("## package.json devDependencies");
	const wantDeps = expectedDevDeps();
	if (!pkg) {
		console.log("  missing package.json");
	} else {
		for (const [name, want] of Object.entries(wantDeps)) {
			const got = pkg.devDependencies?.[name];
			if (!got) console.log(`  missing  ${name} (want ${want})`);
			else console.log(`  present  ${name}@${got}`);
		}
	}

	console.log("");
	console.log("## lint-staged");
	const wantLs = expectedLintStaged();
	if (!pkg?.["lint-staged"]) console.log("  missing");
	else {
		const got = JSON.stringify(pkg["lint-staged"]);
		const want = JSON.stringify(wantLs);
		console.log(got === want ? "  match" : `  drift: ${got}`);
	}

	console.log("");
	console.log("## engines / nvmrc");
	const nvmrc = join(target, ".nvmrc");
	console.log(
		existsSync(nvmrc)
			? `  .nvmrc: ${readFileSync(nvmrc, "utf8").trim()}`
			: "  .nvmrc missing",
	);
	console.log(
		pkg?.engines?.node
			? `  engines.node: ${pkg.engines.node}`
			: "  engines.node missing",
	);

	const gaps = byKind.missing.length + byKind.drift.length;
	const scriptGaps = pkg
		? Object.keys(wantScripts).filter((k) => pkg.scripts?.[k] !== wantScripts[k])
				.length
		: Object.keys(wantScripts).length;
	process.exit(gaps + scriptGaps > 0 ? 1 : 0);
}

main();
