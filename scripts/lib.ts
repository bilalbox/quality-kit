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
export const languagesRoot = join(kitRoot, "languages");

export const PACK_IDS = ["js-ts", "python", "rust", "dart"] as const;
export type PackId = (typeof PACK_IDS)[number];

export type Pack = {
	id: PackId;
	/** Relpaths under languages/<id>/templates/ → target root. */
	copyPaths: readonly string[];
	/** Script names to append into gate:fast when this pack is selected with js-ts. */
	gateFragments?: readonly string[];
};

/** Files copied for js-ts. Manifest JSON fragments are handled separately. */
const JS_TS_COPY_PATHS = [
	"biome.json",
	"biome.complexity.json",
	"tsconfig.base.json",
	"rev-dep.config.json",
	".editorconfig",
	".betterleaks.toml",
	".betterleaksignore",
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
	"scripts/run-secret-scan.ts",
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

const PYTHON_COPY_PATHS = [
	"pyproject.toml",
	"tach.toml",
	"vulture_whitelist.py",
] as const;

export const PACKS: Record<PackId, Pack> = {
	"js-ts": { id: "js-ts", copyPaths: JS_TS_COPY_PATHS },
	python: {
		id: "python",
		copyPaths: PYTHON_COPY_PATHS,
		gateFragments: ["lint:py"],
	},
	rust: { id: "rust", copyPaths: [] },
	dart: { id: "dart", copyPaths: [] },
};

export type DriftKind = "missing" | "match" | "drift" | "present-custom";

export type FileReport = {
	path: string;
	pack: PackId;
	kind: DriftKind;
};

export function packTemplatesRoot(id: PackId): string {
	return join(languagesRoot, id, "templates");
}

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

export function detectPacks(target: string): PackId[] {
	const found: PackId[] = [];
	if (existsSync(join(target, "package.json"))) found.push("js-ts");
	if (hasPython(target)) found.push("python");
	if (existsSync(join(target, "Cargo.toml"))) found.push("rust");
	if (existsSync(join(target, "pubspec.yaml"))) found.push("dart");
	return found;
}

/** Parse --packs and --python from argv; merge with detection when --packs omitted. */
export function resolvePacks(target: string, argv: string[]): PackId[] {
	const packsIdx = argv.indexOf("--packs");
	let packs: PackId[];
	if (packsIdx !== -1 && argv[packsIdx + 1]) {
		const raw = argv[packsIdx + 1]!.split(",").map((s) => s.trim());
		packs = [];
		for (const id of raw) {
			if (!(PACK_IDS as readonly string[]).includes(id)) {
				console.error(
					`Unknown pack "${id}". Valid: ${PACK_IDS.join(", ")}`,
				);
				process.exit(2);
			}
			if (!packs.includes(id as PackId)) packs.push(id as PackId);
		}
	} else {
		packs = detectPacks(target);
	}
	if (argv.includes("--python") && !packs.includes("python")) {
		packs.push("python");
	}
	return packs;
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

export function reportFile(
	targetRoot: string,
	pack: PackId,
	rel: string,
): FileReport {
	const templatePath = join(packTemplatesRoot(pack), rel);
	const targetPath = join(targetRoot, rel);
	if (!existsSync(targetPath)) return { path: rel, pack, kind: "missing" };
	if (!existsSync(templatePath))
		return { path: rel, pack, kind: "present-custom" };
	const a = normalize(readText(templatePath));
	const b = normalize(readText(targetPath));
	return { path: rel, pack, kind: a === b ? "match" : "drift" };
}

function jsTsManifest(name: string): string {
	return join(packTemplatesRoot("js-ts"), name);
}

export function expectedScripts(packs: PackId[]): Record<string, string> {
	if (!packs.includes("js-ts")) return {};
	const scripts = JSON.parse(
		readText(jsTsManifest("package.scripts.json")),
	) as Record<string, string>;
	const withPy = packs.includes("python");
	if (!withPy) {
		delete scripts["lint:py"];
		delete scripts["gate:fast:py"];
	}
	return scripts;
}

/** Composed gate:fast including gateFragments from selected packs. */
export function composedGateFast(packs: PackId[]): string | null {
	if (!packs.includes("js-ts")) return null;
	const base = expectedScripts(packs)["gate:fast"];
	if (!base) return null;
	const extras: string[] = [];
	for (const id of packs) {
		for (const frag of PACKS[id].gateFragments ?? []) {
			extras.push(`pnpm ${frag}`);
		}
	}
	if (extras.length === 0) return base;
	return `${base} && ${extras.join(" && ")}`;
}

export function expectedDevDeps(packs: PackId[]): Record<string, string> {
	if (!packs.includes("js-ts")) return {};
	return JSON.parse(
		readText(jsTsManifest("package.devDependencies.json")),
	) as Record<string, string>;
}

export function expectedLintStaged(
	packs: PackId[],
): Record<string, string[]> {
	if (!packs.includes("js-ts")) return {};
	return JSON.parse(
		readText(jsTsManifest("package.lint-staged.json")),
	) as Record<string, string[]>;
}

export function resolveTarget(argv: string[]): string {
	const idx = argv.indexOf("--target");
	if (idx !== -1 && argv[idx + 1]) return argv[idx + 1]!;
	const positional = argv.find(
		(a, i) =>
			!a.startsWith("-") &&
			argv[i - 1] !== "--target" &&
			argv[i - 1] !== "--packs",
	);
	if (positional) return positional;
	return process.cwd();
}

export function relToKit(path: string): string {
	return relative(kitRoot, path) || ".";
}

export function copyPathsForPacks(
	packs: PackId[],
): { pack: PackId; rel: string }[] {
	const out: { pack: PackId; rel: string }[] = [];
	for (const id of packs) {
		for (const rel of PACKS[id].copyPaths) {
			out.push({ pack: id, rel });
		}
	}
	return out;
}
