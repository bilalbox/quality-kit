import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	contentHash,
	kitRoot,
	packTemplatesRoot,
	readText,
} from "./kit-fs";
import type { Placement } from "./packs";

/** Target-root file recording what apply last wrote (see REFERENCE.md "Lock file"). */
export const LOCK_FILE = ".quality-kit.lock.json";

export type LockFile = {
	version: 1;
	/** Kit `git rev-parse HEAD` at the most recent apply; null outside a git checkout. */
	kitRevision: string | null;
	/** Owned Placement targetRel → contentHash of the content the kit last wrote there. */
	files: Record<string, string>;
};

export type LockRead =
	| { state: "present"; lock: LockFile }
	| { state: "missing" }
	| { state: "invalid"; detail: string };

export function readLock(target: string): LockRead {
	const path = join(target, LOCK_FILE);
	if (!existsSync(path)) return { state: "missing" };
	try {
		const raw = JSON.parse(readText(path)) as Partial<LockFile>;
		if (raw.version !== 1 || typeof raw.files !== "object" || !raw.files) {
			return { state: "invalid", detail: "unsupported version or no files" };
		}
		return {
			state: "present",
			lock: {
				version: 1,
				kitRevision: raw.kitRevision ?? null,
				files: raw.files,
			},
		};
	} catch (err) {
		return { state: "invalid", detail: (err as Error).message };
	}
}

export function kitRevision(): string | null {
	const res = spawnSync("git", ["rev-parse", "HEAD"], {
		cwd: kitRoot,
		encoding: "utf8",
	});
	return res.status === 0 ? res.stdout.trim() : null;
}

/**
 * Rewrite the lock after apply: each owned Placement whose Target copy equals its
 * template gets that hash; others keep their previous entry (or stay unrecorded).
 */
export function recordOwned(
	target: string,
	placements: readonly Placement[],
): LockFile {
	const previous = readLock(target);
	const files =
		previous.state === "present" ? { ...previous.lock.files } : {};
	for (const p of placements) {
		if (p.kind !== "owned") continue;
		const targetPath = join(target, p.targetRel);
		const templatePath = join(packTemplatesRoot(p.pack), p.templateRel);
		if (!existsSync(targetPath) || !existsSync(templatePath)) continue;
		const written = contentHash(readText(targetPath));
		if (written === contentHash(readText(templatePath))) {
			files[p.targetRel] = written;
		}
	}
	const sorted = Object.fromEntries(
		Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
	);
	const lock: LockFile = { version: 1, kitRevision: kitRevision(), files: sorted };
	writeFileSync(join(target, LOCK_FILE), `${JSON.stringify(lock, null, "\t")}\n`);
	return lock;
}
