import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { readText } from "../kit-fs";
import type { WiringGap, WiringProbe } from "./types";

/** How a Host's hook manager installs git hooks, and how to tell it did. */
export type HookManager = {
	name: string;
	/** Hooks the Host's config defines. */
	hooks: readonly string[];
	fix: string;
	owns(hookPath: string, target: string): boolean;
};

export const LEFTHOOK: HookManager = {
	name: "lefthook",
	hooks: ["pre-commit", "pre-push"],
	fix: "run `lefthook install` in the Target (install lefthook first)",
	owns: (hookPath) => readText(hookPath).includes("lefthook"),
};

export const HUSKY: HookManager = {
	name: "husky",
	hooks: ["pre-commit", "pre-push"],
	fix: "run `pnpm install` in the Target (the prepare script runs husky and sets core.hooksPath)",
	owns: (hookPath, target) => relative(target, hookPath).startsWith(".husky"),
};

/** Git's active hooks dir (honours core.hooksPath), or null outside a git work tree. */
function hooksDir(target: string): string | null {
	const res = spawnSync("git", ["-C", target, "rev-parse", "--git-path", "hooks"], {
		encoding: "utf8",
	});
	return res.status === 0 ? resolve(target, res.stdout.trim()) : null;
}

function isExecutable(path: string): boolean {
	return existsSync(path) && (statSync(path).mode & 0o111) !== 0;
}

export function hooksInstalledProbe(manager: HookManager): WiringProbe {
	return {
		label: `git hooks installed (${manager.name})`,
		check(target): WiringGap[] {
			const dir = hooksDir(target);
			if (!dir) {
				return [{ detail: "not a git repository", fix: `git init, then ${manager.fix}` }];
			}
			const missing = manager.hooks.filter((hook) => {
				const path = join(dir, hook);
				return !isExecutable(path) || !manager.owns(path, target);
			});
			if (missing.length === 0) return [];
			return [{ detail: `${missing.join(", ")} not installed`, fix: manager.fix }];
		},
	};
}
