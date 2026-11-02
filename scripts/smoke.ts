/**
 * Per-Pack adoption smoke: scaffold → apply → wire → audit → gate full.
 *
 * Usage: pnpm smoke -- --pack <js-ts|dart|kotlin-android> [--keep]
 */

import { kitRoot } from "./kit-fs";
import { runSmoke, StepFailed } from "./smoke/adopt";
import { SMOKE_RECIPES } from "./smoke/index";
import type { PackId } from "./packs/types";

function usage(): never {
	console.error(
		"Usage: pnpm smoke -- --pack <js-ts|dart|kotlin-android> [--keep]",
	);
	console.error(
		"  python: Host Pack smoke lands with #17 (extend scripts/smoke/index.ts).",
	);
	process.exit(2);
}

function main(): void {
	const argv = process.argv.slice(2);
	const packIdx = argv.indexOf("--pack");
	const pack = (packIdx === -1 ? undefined : argv[packIdx + 1]) as
		| PackId
		| undefined;
	if (!pack) usage();

	const recipe = SMOKE_RECIPES[pack];
	if (!recipe) {
		if (pack === "python") {
			console.error(
				"python Host Pack smoke is not wired yet (#17). Add scripts/smoke/python.ts and register it in scripts/smoke/index.ts.",
			);
			process.exit(2);
		}
		console.error(`No smoke recipe for pack '${pack}'.`);
		usage();
	}

	try {
		runSmoke({
			pack,
			recipe,
			kitRoot,
			keep: argv.includes("--keep"),
		});
	} catch (err) {
		if (err instanceof StepFailed) {
			console.error(`# smoke ${pack} failed: ${err.message}`);
			process.exit(1);
		}
		throw err;
	}
}

main();
