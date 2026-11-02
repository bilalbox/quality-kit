/**
 * Per-Pack adoption smoke: scaffold → apply → wire → audit → gate full.
 *
 * Usage: pnpm smoke -- --pack <js-ts|python|dart|kotlin-android> [--keep]
 */

import { kitRoot } from "./kit-fs";
import type { PackId } from "./packs/types";
import { runSmoke, StepFailed } from "./smoke/adopt";
import { HOST_SMOKES } from "./smoke/index";

function usage(): never {
	console.error(
		"Usage: pnpm smoke -- --pack <js-ts|python|dart|kotlin-android> [--keep]",
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

	const smoke = HOST_SMOKES[pack];
	if (!smoke) {
		console.error(`No Host smoke for pack '${pack}'.`);
		usage();
	}

	try {
		runSmoke({
			pack,
			smoke,
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
