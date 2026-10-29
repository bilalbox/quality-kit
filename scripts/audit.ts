/**
 * Read-only conformance + drift report vs quality-kit pack templates.
 *
 * Usage: pnpm audit -- --target /path/to/repo [--packs a,b] [--python]
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	composedGateFast,
	copyPathsForPacks,
	DART_PACKAGE_COPY_PATHS,
	expectedDevDeps,
	expectedLintStaged,
	expectedScripts,
	normalize,
	packTemplatesRoot,
	readText,
	reportFile,
	resolveDartRoots,
	resolvePacks,
	resolveTarget,
	type FileReport,
} from "./lib";

function reportDartPackageFile(
	targetRoot: string,
	packageRoot: string,
	rel: string,
): FileReport {
	const templatePath = join(packTemplatesRoot("dart"), "package", rel);
	const targetPath = join(
		targetRoot,
		packageRoot === "." ? rel : join(packageRoot, rel),
	);
	if (!existsSync(targetPath)) {
		return { path: `${packageRoot}/${rel}`, pack: "dart", kind: "missing" };
	}
	if (!existsSync(templatePath)) {
		return {
			path: `${packageRoot}/${rel}`,
			pack: "dart",
			kind: "present-custom",
		};
	}
	const a = normalize(readText(templatePath));
	const b = normalize(readText(targetPath));
	return {
		path: `${packageRoot}/${rel}`,
		pack: "dart",
		kind: a === b ? "match" : "drift",
	};
}

function main(): void {
	const argv = process.argv.slice(2);
	const target = resolveTarget(argv);
	if (!existsSync(target)) {
		console.error(`Target not found: ${target}`);
		process.exit(2);
	}

	const packs = resolvePacks(target, argv);
	const entries = copyPathsForPacks(packs);
	const reports: FileReport[] = entries.map(({ pack, rel }) =>
		reportFile(target, pack, rel),
	);

	if (packs.includes("dart")) {
		for (const root of resolveDartRoots(target)) {
			for (const rel of DART_PACKAGE_COPY_PATHS) {
				reports.push(reportDartPackageFile(target, root, rel));
			}
		}
	}

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
	console.log(`Packs: ${packs.length ? packs.join(", ") : "(none)"}`);
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
	for (const r of byKind.missing)
		console.log(`  missing  [${r.pack}] ${r.path}`);
	for (const r of byKind.drift)
		console.log(`  drift    [${r.pack}] ${r.path}`);
	if (reports.length === 0) {
		console.log("  (no templates for selected packs — stub or empty)");
	}

	const wantScripts = expectedScripts(packs);
	const gateFast = composedGateFast(packs);
	if (gateFast) wantScripts["gate:fast"] = gateFast;

	if (packs.includes("js-ts")) {
		console.log("");
		console.log("## package.json scripts");
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
		const wantDeps = expectedDevDeps(packs);
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
		const wantLs = expectedLintStaged(packs);
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
	}

	if (packs.includes("dart")) {
		console.log("");
		console.log("## dart roots");
		const roots = resolveDartRoots(target);
		console.log(
			roots.length
				? `  ${roots.join(", ")}`
				: "  (none — set quality-kit.dart.json roots)",
		);
	}

	const gaps = byKind.missing.length + byKind.drift.length;
	const scriptGaps =
		packs.includes("js-ts") && pkg
			? Object.keys(wantScripts).filter(
					(k) => pkg.scripts?.[k] !== wantScripts[k],
				).length
			: packs.includes("js-ts")
				? Object.keys(wantScripts).length
				: 0;
	process.exit(gaps + scriptGaps > 0 ? 1 : 0);
}

main();
