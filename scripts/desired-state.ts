import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { normalize, packTemplatesRoot, readText } from "./kit-fs";
import {
	PACKS,
	resolveDartRoots,
	type MergeInto,
	type PackId,
	type Placement,
	type PlacementKind,
} from "./packs";

export type DesiredPackageJson = {
	scripts: Record<string, string>;
	devDependencies: Record<string, string>;
	lintStaged: Record<string, string[]>;
	enginesNode: string;
};

/** Complete inventory selected Packs imply for a Target. */
export type DesiredState = {
	packs: readonly PackId[];
	rootPlacements: readonly Placement[];
	packagePlacements: readonly Placement[];
	/** Present when a Host that owns package.json (js-ts) is selected. */
	packageJson: DesiredPackageJson | null;
	/** Post-apply steps per selected Pack that declares any, in Pack order. */
	nextSteps: readonly PackNextSteps[];
};

export type PackNextSteps = { pack: PackId; steps: readonly string[] };

/** Per-kind file status: owned compares bytes, seed checks presence, merge-into checks the dest. */
export type FileStatus =
	| "missing"
	| "match"
	| "drift"
	| "present-custom"
	| "present"
	| "invalid"
	| "merged"
	| "unmerged";

export type FileFinding = {
	path: string;
	pack: PackId;
	kind: PlacementKind;
	status: FileStatus;
	/** merge-into: the Target file the content must land in. */
	dest?: string;
	/** Why a seed is invalid or a merge-into is unmerged. */
	detail?: string;
};

const FILE_GAPS: ReadonlySet<FileStatus> = new Set([
	"missing",
	"drift",
	"invalid",
	"unmerged",
]);

/** True when the finding should fail audit. */
export function isFileGap(finding: FileFinding): boolean {
	return FILE_GAPS.has(finding.status);
}

export type ScriptFinding = {
	name: string;
	kind: "missing" | "match" | "drift";
	got?: string;
	want: string;
};

export type DiffReport = {
	files: FileFinding[];
	scripts: ScriptFinding[];
	devDependencies: {
		name: string;
		kind: "missing" | "present";
		got?: string;
		want: string;
	}[];
	lintStaged: "missing" | "match" | "drift" | "skipped";
	enginesNode: string | null;
	nvmrc: string | null;
	dartRoots: string[] | null;
};

function firstWinsPlacements(
	acc: Placement[],
	incoming: readonly Placement[],
): void {
	for (const p of incoming) {
		if (acc.some((x) => x.targetRel === p.targetRel)) continue;
		acc.push(p);
	}
}

/** Build Desired state by merging Pack Contributions (first-wins on targetRel). */
export function desiredState(
	target: string,
	packs: readonly PackId[],
): DesiredState {
	const rootPlacements: Placement[] = [];
	const packagePlacements: Placement[] = [];

	let scripts: Record<string, string> = {};
	let devDependencies: Record<string, string> = {};
	let lintStaged: Record<string, string[]> = {};
	let enginesNode: string | undefined;
	const gateFragments: string[] = [];
	let hasJsTsHost = false;
	const nextSteps: PackNextSteps[] = [];

	for (const id of packs) {
		const contrib = PACKS[id].contribute(target, packs);
		firstWinsPlacements(rootPlacements, contrib.rootPlacements);
		firstWinsPlacements(packagePlacements, contrib.packagePlacements);
		if (contrib.nextSteps.length > 0) {
			nextSteps.push({ pack: id, steps: contrib.nextSteps });
		}

		const pj = contrib.packageJson;
		if (!pj) continue;

		if (id === "js-ts") hasJsTsHost = true;

		if (pj.scripts) scripts = { ...scripts, ...pj.scripts };
		if (pj.devDependencies)
			devDependencies = { ...devDependencies, ...pj.devDependencies };
		if (pj.lintStaged) lintStaged = { ...lintStaged, ...pj.lintStaged };
		if (pj.enginesNode) enginesNode = pj.enginesNode;
		for (const frag of pj.gateFragments ?? []) gateFragments.push(frag);
	}

	let packageJson: DesiredPackageJson | null = null;
	if (hasJsTsHost) {
		if (gateFragments.length > 0 && scripts["gate:fast"]) {
			scripts = {
				...scripts,
				"gate:fast": `${scripts["gate:fast"]} && ${gateFragments
					.map((f) => `pnpm ${f}`)
					.join(" && ")}`,
			};
		}
		packageJson = {
			scripts,
			devDependencies,
			lintStaged,
			enginesNode: enginesNode ?? ">=24.0.0 <25",
		};
	}

	return {
		packs,
		rootPlacements,
		packagePlacements,
		packageJson,
		nextSteps,
	};
}

/** Markers of a merge-into Placement that its dest lacks (all of them when dest is missing). */
export function missingMarkers(target: string, merge: MergeInto): string[] {
	const destPath = join(target, merge.dest);
	if (!existsSync(destPath)) return [...merge.markers];
	const lines = normalize(readText(destPath))
		.split("\n")
		.map((l) => l.trimStart());
	return merge.markers.filter((m) => !lines.some((l) => l.startsWith(m)));
}

function compareOwned(targetPath: string, templatePath: string): FileStatus {
	if (!existsSync(templatePath)) return "present-custom";
	const a = normalize(readText(templatePath));
	const b = normalize(readText(targetPath));
	return a === b ? "match" : "drift";
}

function seedParseError(targetPath: string): string | undefined {
	if (!targetPath.endsWith(".json")) return undefined;
	try {
		JSON.parse(readText(targetPath));
		return undefined;
	} catch (err) {
		return `not valid JSON: ${(err as Error).message}`;
	}
}

function comparePlacement(
	targetRoot: string,
	placement: Placement,
): FileFinding {
	const base = {
		path: placement.targetRel,
		pack: placement.pack,
		kind: placement.kind,
	};

	if (placement.kind === "merge-into") {
		const { dest } = placement.mergeInto;
		if (!existsSync(join(targetRoot, dest))) {
			return { ...base, status: "unmerged", dest, detail: `${dest} missing` };
		}
		const absent = missingMarkers(targetRoot, placement.mergeInto);
		if (absent.length === 0) return { ...base, status: "merged", dest };
		return {
			...base,
			status: "unmerged",
			dest,
			detail: `${dest} lacks ${absent.join(", ")}`,
		};
	}

	const targetPath = join(targetRoot, placement.targetRel);
	if (!existsSync(targetPath)) return { ...base, status: "missing" };

	if (placement.kind === "seed") {
		const detail = seedParseError(targetPath);
		return detail
			? { ...base, status: "invalid", detail }
			: { ...base, status: "present" };
	}

	const templatePath = join(
		packTemplatesRoot(placement.pack),
		placement.templateRel,
	);
	return { ...base, status: compareOwned(targetPath, templatePath) };
}

/** Diff Target against Desired state, judging each Placement by its kind (ignores file mode). */
export function diffAgainst(
	target: string,
	state: DesiredState,
): DiffReport {
	const files: FileFinding[] = [
		...state.rootPlacements.map((p) => comparePlacement(target, p)),
		...state.packagePlacements.map((p) => comparePlacement(target, p)),
	];

	const pkgPath = join(target, "package.json");
	const pkg = existsSync(pkgPath)
		? (JSON.parse(readFileSync(pkgPath, "utf8")) as {
				scripts?: Record<string, string>;
				devDependencies?: Record<string, string>;
				"lint-staged"?: Record<string, string[]>;
				engines?: { node?: string };
			})
		: null;

	const scripts: ScriptFinding[] = [];
	const devDependencies: DiffReport["devDependencies"] = [];
	let lintStaged: DiffReport["lintStaged"] = "skipped";
	let enginesNode: string | null = null;
	let nvmrc: string | null = null;
	let dartRoots: string[] | null = null;

	if (state.packageJson) {
		const want = state.packageJson;
		for (const [name, wantVal] of Object.entries(want.scripts)) {
			const got = pkg?.scripts?.[name];
			if (!got) scripts.push({ name, kind: "missing", want: wantVal });
			else if (got !== wantVal)
				scripts.push({ name, kind: "drift", got, want: wantVal });
			else scripts.push({ name, kind: "match", got, want: wantVal });
		}
		for (const [name, wantVal] of Object.entries(want.devDependencies)) {
			const got = pkg?.devDependencies?.[name];
			if (!got)
				devDependencies.push({
					name,
					kind: "missing",
					want: wantVal,
				});
			else
				devDependencies.push({
					name,
					kind: "present",
					got,
					want: wantVal,
				});
		}
		if (!pkg?.["lint-staged"]) lintStaged = "missing";
		else {
			lintStaged =
				JSON.stringify(pkg["lint-staged"]) ===
				JSON.stringify(want.lintStaged)
					? "match"
					: "drift";
		}
		enginesNode = pkg?.engines?.node ?? null;
		const nvmrcPath = join(target, ".nvmrc");
		nvmrc = existsSync(nvmrcPath)
			? readFileSync(nvmrcPath, "utf8").trim()
			: null;
	}

	if (state.packs.includes("dart")) {
		dartRoots = resolveDartRoots(target);
	}

	return {
		files,
		scripts,
		devDependencies,
		lintStaged,
		enginesNode,
		nvmrc,
		dartRoots,
	};
}
