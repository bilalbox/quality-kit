import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { packTemplatesRoot, readText } from "../kit-fs";
import { AGENTS_MD, type FileKind, placeFiles } from "./placements";
import { postApplySteps } from "./post-apply";
import type { Contribution, Pack, Placement } from "./types";
import { SKIP_DIRS, walkFiles } from "./walk";
import { hooksInstalledProbe, LEFTHOOK } from "./wiring";

const ROOT_FILES: Record<string, FileKind> = {
	"quality-kit.dart.json": "seed",
	"lefthook.yml": "owned",
	".editorconfig": "owned",
	".betterleaks.toml": "owned",
	".betterleaksignore": "seed",
	Makefile: { dest: "Makefile", markers: ["gate-fast:", "gate:"] },
	"AGENTS.quality.md": AGENTS_MD,
	".github/workflows/ci.yml": "owned",
	".github/actions/setup-flutter/action.yml": "owned",
	".github/actions/quality-gate/action.yml": "owned",
	"tools/quality/lib.sh": "owned",
	"tools/quality/gate.sh": "owned",
	"tools/quality/run-secret-scan.sh": "owned",
	"tools/quality/run-format.sh": "owned",
	"tools/quality/run-analyze.sh": "owned",
	"tools/quality/run-deps.sh": "owned",
	"tools/quality/run-test.sh": "owned",
};

/** Templated under package/flutter/ or package/dart/, picked per root. */
const VARIANT_PACKAGE_FILES: Record<string, FileKind> = {
	"analysis_options.yaml": "owned",
};

const PACKAGE_FILES: Record<string, FileKind> = {
	"dart_dependency_validator.yaml": "seed",
};

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

/** Same check as `quality_has_flutter` in templates/tools/quality/lib.sh. */
function rootHasFlutter(target: string, root: string): boolean {
	const pubspec = join(target, root, "pubspec.yaml");
	if (!existsSync(pubspec)) return false;
	return /^[ \t]*flutter:/m.test(readText(pubspec));
}

function packagePlacements(target: string): Placement[] {
	return resolveDartRoots(target).flatMap((root) => {
		const variant = rootHasFlutter(target, root) ? "flutter" : "dart";
		return [
			...placeFiles("dart", VARIANT_PACKAGE_FILES, {
				templateDir: join("package", variant),
				targetDir: root,
			}),
			...placeFiles("dart", PACKAGE_FILES, {
				templateDir: "package",
				targetDir: root,
			}),
		];
	});
}

export const dartPack: Pack = {
	id: "dart",
	kind: "host",
	detect(target: string): boolean {
		return walkFiles(target, 3, (name) => name === "pubspec.yaml");
	},
	contribute(target: string, _selected: readonly string[]): Contribution {
		return {
			rootPlacements: placeFiles("dart", ROOT_FILES),
			packagePlacements: packagePlacements(target),
			// no packageJson — dart Host does not own package.json merges
			nextSteps: postApplySteps("dart"),
			probes: [hooksInstalledProbe(LEFTHOOK)],
		};
	},
};
