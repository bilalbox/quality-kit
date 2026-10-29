import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const SKIP_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	".dart_tool",
	".idea",
	".vscode",
	"ephemeral", // Flutter iOS/macOS generated helpers
]);

/** Walk Target tree up to maxDepth; return true if predicate matches a file. */
export function walkFiles(
	root: string,
	maxDepth: number,
	match: (name: string, path: string) => boolean,
): boolean {
	const walk = (dir: string, depth: number): boolean => {
		if (depth > maxDepth || !existsSync(dir)) return false;
		for (const entry of readdirSync(dir)) {
			if (SKIP_DIRS.has(entry)) continue;
			const path = join(dir, entry);
			const st = statSync(path);
			if (st.isDirectory()) {
				if (walk(path, depth + 1)) return true;
			} else if (match(entry, path)) {
				return true;
			}
		}
		return false;
	};
	return walk(root, 0);
}
