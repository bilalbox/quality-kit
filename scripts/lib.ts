import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const templatesRoot = join(kitRoot, "templates");

/** Files copied into target repos. Manifest JSON fragments are handled separately. */
export const COPY_PATHS = [
	"biome.json",
	"biome.complexity.json",
	"tsconfig.base.json",
	"rev-dep.config.json",
	".editorconfig",
	".npmrc",
	".nvmrc",
	".gitignore",
	"pnpm-workspace.yaml",
	".husky/pre-commit",
	".husky/pre-push",
	".github/workflows/ci.yml",
	".github/actions/setup-pnpm/action.yml",
	".github/actions/quality-gate/action.yml",
	"scripts/ratchets/compare.ts",
	"scripts/ratchets/run-tool.ts",
	"scripts/ratchets/run-complexity.ts",
	"scripts/run-rev-dep.ts",
	"baselines/complexity.json",
	"tests/ratchets/ratchet-contract.test.sh",
	"tests/ratchets/fixtures/baseline-green.json",
	"tests/ratchets/fixtures/baseline-scored.json",
	"tests/ratchets/fixtures/baseline-stale.json",
	"tests/ratchets/fixtures/findings-green.json",
	"tests/ratchets/fixtures/findings-novel.json",
	"tests/ratchets/fixtures/findings-regression.json",
	"tests/ratchets/fixtures/findings-stale.json",
	"AGENTS.quality.md",
] as const;

export const PYTHON_COPY_PATHS = [
	"pyproject.toml",
	"tach.toml",
	"vulture_whitelist.py",
] as const;

export type DriftKind = "missing" | "match" | "drift" | "present-custom";

export type FileReport = {
	path: string;
	kind: DriftKind;
};

export function hasPython(target: string): boolean {
	const walk = (dir: string, depth: number): boolean => {
		if (depth > 4 || !existsSync(dir)) return false;
		for (const entry of readdirSync(dir)) {
			if (entry === "node_modules" || entry === ".git" || entry === "dist")
				continue;
			const path = join(dir, entry);
			const st = statSync(path);
			if (st.isDirectory()) {
				if (walk(path, depth + 1)) return true;
			} else if (entry.endsWith(".py")) {
				return true;
			}
		}
		return false;
	};
	return walk(target, 0);
}

export function readText(path: string): string {
	return readFileSync(path, "utf8");
}

export function normalize(text: string): string {
	return text.replace(/\r\n/g, "\n");
}

export function ensureDir(path: string): void {
	mkdirSync(dirname(path), { recursive: true });
}

export function copyIfMissing(
	src: string,
	dest: string,
	force = false,
): "copied" | "skipped" | "overwrote" {
	if (existsSync(dest) && !force) return "skipped";
	ensureDir(dest);
	const existed = existsSync(dest);
	writeFileSync(dest, readFileSync(src));
	return existed ? "overwrote" : "copied";
}

export function reportFile(targetRoot: string, rel: string): FileReport {
	const templatePath = join(templatesRoot, rel);
	const targetPath = join(targetRoot, rel);
	if (!existsSync(targetPath)) return { path: rel, kind: "missing" };
	if (!existsSync(templatePath)) return { path: rel, kind: "present-custom" };
	const a = normalize(readText(templatePath));
	const b = normalize(readText(targetPath));
	return { path: rel, kind: a === b ? "match" : "drift" };
}

export function expectedScripts(withPy: boolean): Record<string, string> {
	const scripts = JSON.parse(
		readText(join(templatesRoot, "package.scripts.json")),
	) as Record<string, string>;
	if (!withPy) {
		delete scripts["lint:py"];
		delete scripts["gate:fast:py"];
	}
	return scripts;
}

export function expectedDevDeps(): Record<string, string> {
	return JSON.parse(
		readText(join(templatesRoot, "package.devDependencies.json")),
	) as Record<string, string>;
}

export function expectedLintStaged(): Record<string, string[]> {
	return JSON.parse(
		readText(join(templatesRoot, "package.lint-staged.json")),
	) as Record<string, string[]>;
}

export function resolveTarget(argv: string[]): string {
	const idx = argv.indexOf("--target");
	if (idx !== -1 && argv[idx + 1]) return argv[idx + 1]!;
	const positional = argv.find((a) => !a.startsWith("-"));
	if (positional) return positional;
	return process.cwd();
}

export function relToKit(path: string): string {
	return relative(kitRoot, path) || ".";
}
