import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { packTemplatesRoot, readText } from "../kit-fs";
import type { Contribution, Pack, Placement } from "./types";
import { SKIP_DIRS, walkFiles } from "./walk";

const ROOT_COPY_PATHS = [
	"quality-kit.dart.json",
	"lefthook.yml",
	".editorconfig",
	".betterleaks.toml",
	".betterleaksignore",
	"Makefile",
	"AGENTS.quality.md",
	".github/workflows/ci.yml",
	".github/actions/setup-flutter/action.yml",
	".github/actions/quality-gate/action.yml",
	"tools/quality/lib.sh",
	"tools/quality/gate.sh",
	"tools/quality/run-secret-scan.sh",
	"tools/quality/run-format.sh",
	"tools/quality/run-analyze.sh",
	"tools/quality/run-deps.sh",
	"tools/quality/run-test.sh",
] as const;

const PACKAGE_COPY_PATHS = [
	"analysis_options.yaml",
	"dart_dependency_validator.yaml",
] as const;

/**
 * Package dirs that contain pubspec.yaml.
 * Uses quality-kit.dart.json `roots` when non-empty; otherwise auto-detects
 * (`.` if root pubspec, else depth-1 then depth-2 package dirs).
 */
export function resolveDartRoots(target: string): string[] {
	const cfgPath = join(target, "quality-kit.dart.json");
	if (existsSync(cfgPath)) {
		try {
			const cfg = JSON.parse(readText(cfgPath)) as { roots?: unknown };
			if (Array.isArray(cfg.roots) && cfg.roots.length > 0) {
				return cfg.roots.filter((r): r is string => typeof r === "string");
			}
		} catch {
			/* fall through to auto-detect */
		}
	}

	if (existsSync(join(target, "pubspec.yaml"))) return ["."];

	const depth1: string[] = [];
	for (const entry of readdirSync(target)) {
		if (SKIP_DIRS.has(entry)) continue;
		const dir = join(target, entry);
		if (!statSync(dir).isDirectory()) continue;
		if (existsSync(join(dir, "pubspec.yaml"))) depth1.push(entry);
	}
	if (depth1.length > 0) return depth1.sort();

	const depth2: string[] = [];
	for (const entry of readdirSync(target)) {
		if (SKIP_DIRS.has(entry)) continue;
		const dir = join(target, entry);
		if (!statSync(dir).isDirectory()) continue;
		for (const child of readdirSync(dir)) {
			if (SKIP_DIRS.has(child)) continue;
			const sub = join(dir, child);
			if (!statSync(sub).isDirectory()) continue;
			if (existsSync(join(sub, "pubspec.yaml"))) {
				depth2.push(join(entry, child));
			}
		}
	}
	return depth2.sort();
}

function rootPlacements(): Placement[] {
	return ROOT_COPY_PATHS.map((rel) => ({
		pack: "dart" as const,
		templateRel: rel,
		targetRel: rel,
		executable: rel.endsWith(".sh") ? true : undefined,
	}));
}

function packagePlacements(target: string): Placement[] {
	const out: Placement[] = [];
	for (const root of resolveDartRoots(target)) {
		for (const rel of PACKAGE_COPY_PATHS) {
			out.push({
				pack: "dart",
				templateRel: join("package", rel),
				targetRel: root === "." ? rel : join(root, rel),
			});
		}
	}
	return out;
}

export const dartPack: Pack = {
	id: "dart",
	kind: "host",
	detect(target: string): boolean {
		return walkFiles(target, 3, (name) => name === "pubspec.yaml");
	},
	contribute(target: string, _selected: readonly string[]): Contribution {
		return {
			rootPlacements: rootPlacements(),
			packagePlacements: packagePlacements(target),
			// no packageJson — dart Host does not own package.json merges
		};
	},
};
