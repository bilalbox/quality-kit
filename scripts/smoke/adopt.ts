/**
 * Adopt a Host Pack into a freshly scaffolded Target and assert audit + gate.
 * CI jobs are thin wrappers around `pnpm smoke -- --pack <id>`.
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PackId } from "../packs/types";
import { ciEnv, onPath, sh, StepFailed } from "./run";
import type { HostSmoke } from "./types";

export { StepFailed };

export type RunSmokeOptions = {
	pack: PackId;
	smoke: HostSmoke;
	kitRoot: string;
	/** Directory that will hold the unique Target child. Defaults to os.tmpdir(). */
	workParent?: string;
	/** Keep the Target after success (default: delete on success). */
	keep?: boolean;
	/** Test seam: replace apply. Default runs `scripts/apply.ts --packs <pack>`. */
	apply?: (target: string) => void;
	/** Test seam: replace audit. Default runs `scripts/audit.ts --packs <pack>`. */
	audit?: (target: string) => void;
};

function defaultApply(kitRoot: string, pack: PackId, target: string): void {
	sh(kitRoot, [
		"pnpm",
		"exec",
		"tsx",
		"scripts/apply.ts",
		"--target",
		target,
		"--packs",
		pack,
	]);
}

function defaultAudit(kitRoot: string, pack: PackId, target: string): void {
	sh(kitRoot, [
		"pnpm",
		"exec",
		"tsx",
		"scripts/audit.ts",
		"--target",
		target,
		"--packs",
		pack,
	]);
}

/** Unique path under workParent that does not exist yet (scaffold creates it). */
function freshTargetPath(workParent: string, pack: PackId): string {
	mkdirSync(workParent, { recursive: true });
	for (;;) {
		const target = join(
			workParent,
			`smoke-${pack}-${randomBytes(4).toString("hex")}`,
		);
		if (!existsSync(target)) return target;
	}
}

/**
 * scaffold → git init → apply → wire → audit → gate (CI=true).
 * Returns the Target path. Throws StepFailed on the first failing step.
 */
export function runSmoke(opts: RunSmokeOptions): string {
	const { pack, smoke, kitRoot } = opts;
	const missing = smoke.tools.filter((bin) => !onPath(bin));
	if (missing.length > 0) {
		throw new StepFailed(
			`missing tool(s) on PATH: ${missing.join(", ")} (needed for ${pack} Host smoke)`,
		);
	}

	const workParent = opts.workParent ?? tmpdir();
	const target = freshTargetPath(workParent, pack);
	let succeeded = false;
	try {
		console.log(`# smoke ${pack} → ${target}`);
		smoke.scaffold(target);
		sh(target, ["git", "init", "-q"]);
		sh(target, ["git", "config", "user.email", "smoke@quality-kit.local"]);
		sh(target, ["git", "config", "user.name", "quality-kit smoke"]);

		(opts.apply ?? ((t) => defaultApply(kitRoot, pack, t)))(target);
		smoke.wire(target);
		(opts.audit ?? ((t) => defaultAudit(kitRoot, pack, t)))(target);

		for (const argv of smoke.gate) {
			sh(target, argv, ciEnv());
		}
		succeeded = true;
		console.log(`# smoke ${pack} ok`);
		return target;
	} finally {
		if (succeeded && !opts.keep) {
			rmSync(target, { recursive: true, force: true });
		}
	}
}
