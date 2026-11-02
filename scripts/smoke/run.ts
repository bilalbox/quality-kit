import { spawnSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

export class StepFailed extends Error {}

/** Environment for adoption steps: baseline updates are refused under `CI`. */
export function adopterEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	delete env.CI;
	delete env.HUSKY;
	return env;
}

export function ciEnv(): NodeJS.ProcessEnv {
	return { ...process.env, CI: "true" };
}

/** Run a command with inherited stdio; throw StepFailed on a non-zero exit. */
export function sh(
	cwd: string,
	argv: readonly string[],
	env: NodeJS.ProcessEnv = adopterEnv(),
): void {
	const [cmd, ...args] = argv;
	console.log(`$ ${argv.join(" ")}`);
	const res = spawnSync(cmd!, args, { cwd, env, stdio: "inherit" });
	if (res.error) throw new StepFailed(`${cmd}: ${res.error.message}`);
	if (res.status !== 0) {
		throw new StepFailed(`\`${argv.join(" ")}\` exited ${res.status ?? res.signal}`);
	}
}

export function onPath(bin: string): boolean {
	return spawnSync("sh", ["-c", `command -v "${bin}"`], { stdio: "ignore" }).status === 0;
}

/** Do the `AGENTS.quality.md` → `AGENTS.md` merge-into step, then drop the fragment. */
export function mergeAgentsMd(target: string): void {
	const fragment = join(target, "AGENTS.quality.md");
	appendFileSync(join(target, "AGENTS.md"), readFileSync(fragment));
	rmSync(fragment);
}

/** Merge a self-merge or merge-into fragment into a destination the scaffold already has. */
export function appendFragment(target: string, fragmentRel: string, destRel: string): void {
	const dest = join(target, destRel);
	const prefix = existsSync(dest) && !readFileSync(dest, "utf8").endsWith("\n") ? "\n" : "";
	appendFileSync(dest, prefix + readFileSync(join(target, fragmentRel), "utf8"));
	rmSync(join(target, fragmentRel));
}

export function editJson<T>(path: string, edit: (value: T) => void): void {
	const value = JSON.parse(readFileSync(path, "utf8")) as T;
	edit(value);
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`);
}
