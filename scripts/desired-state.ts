import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { normalize, packTemplatesRoot, readText } from "./kit-fs";
import { PACKS, resolveDartRoots, type PackId, type Placement } from "./packs";

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
};

export type DriftKind = "missing" | "match" | "drift" | "present-custom";

export type FileFinding = {
	path: string;
	pack: PackId;
	kind: DriftKind;
};

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

	for (const id of packs) {
		const contrib = PACKS[id].contribute(target, packs);
		firstWinsPlacements(rootPlacements, contrib.rootPlacements);
		firstWinsPlacements(packagePlacements, contrib.packagePlacements);

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
	};
}

function comparePlacement(
	targetRoot: string,
	placement: Placement,
): FileFinding {
	const templatePath = join(
		packTemplatesRoot(placement.pack),
		placement.templateRel,
	);
	const targetPath = join(targetRoot, placement.targetRel);
	if (!existsSync(targetPath)) {
		return {
			path: placement.targetRel,
			pack: placement.pack,
			kind: "missing",
		};
	}
	if (!existsSync(templatePath)) {
		return {
			path: placement.targetRel,
			pack: placement.pack,
			kind: "present-custom",
		};
	}
	const a = normalize(readText(templatePath));
	const b = normalize(readText(targetPath));
	return {
		path: placement.targetRel,
		pack: placement.pack,
		kind: a === b ? "match" : "drift",
	};
}

/** Diff Target against Desired state (content/presence only; ignores file mode). */
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
