import { existsSync } from "node:fs";
import { join } from "node:path";
import { languagesRoot, normalize, readText } from "../kit-fs";
import type { PackId } from "./types";

const HEADING = "## Post-apply";

/**
 * Ordered post-apply steps: the numbered list under `## Post-apply` in
 * `languages/<id>/MODULE.md`. Each list item must stay on one line.
 */
export function postApplySteps(id: PackId): string[] {
	const path = join(languagesRoot, id, "MODULE.md");
	if (!existsSync(path)) return [];
	const lines = normalize(readText(path)).split("\n");
	const start = lines.indexOf(HEADING);
	if (start === -1) return [];

	const steps: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (line.startsWith("## ")) break;
		const item = /^\d+\.\s+(.+)$/.exec(line);
		if (item) steps.push(item[1]!);
	}
	return steps;
}
