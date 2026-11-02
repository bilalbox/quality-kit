import { copyFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { kitRoot } from "../kit-fs";
import { mergeAgentsMd, sh } from "./run";
import type { HostSmoke } from "./types";

/** flutter create greenfield + dart Post-apply. */
export const dartSmoke: HostSmoke = {
	tools: ["flutter", "dart", "betterleaks", "osv-scanner", "lefthook", "git"],
	scaffold(target) {
		const name = basename(target).replace(/[^a-z0-9_]/g, "_");
		const projectName = /^[a-z]/.test(name) ? name : `smoke_${name}`;
		sh(dirname(target), [
			"flutter",
			"create",
			"--project-name",
			projectName,
			"--org",
			"dev.qualitykit",
			"--platforms",
			"android,ios,web",
			target,
		]);
		// Owned analysis_options: drop the scaffold copy so apply places the kit's.
		rmSync(join(target, "analysis_options.yaml"), { force: true });
		writeFileSync(join(target, "AGENTS.md"), "# Smoke\n");
	},
	wire(target) {
		writeFileSync(
			join(target, "quality-kit.dart.json"),
			`${JSON.stringify({ roots: ["."], flutterEnv: "tools/flutter-env.sh" }, null, "\t")}\n`,
		);
		// Re-place analysis_options if apply ran before delete (idempotent).
		const kitAo = join(
			kitRoot,
			"languages/dart/templates/package/flutter/analysis_options.yaml",
		);
		copyFileSync(kitAo, join(target, "analysis_options.yaml"));
		mergeAgentsMd(target);
		sh(target, ["lefthook", "install"]);
		// Refresh lock hashes for analysis_options now that it matches the template.
		sh(kitRoot, [
			"pnpm",
			"exec",
			"tsx",
			"scripts/apply.ts",
			"--target",
			target,
			"--packs",
			"dart",
		]);
	},
	gate: [["./tools/quality/gate.sh", "full"]],
};
