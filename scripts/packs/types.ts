export const PACK_IDS = ["js-ts", "python", "rust", "dart", "kotlin-android"] as const;
export type PackId = (typeof PACK_IDS)[number];

export type PackKind = "host" | "fragment";

/** One template → Target path mapping contributed by a Pack. */
export type Placement = {
	pack: PackId;
	/** Relpath under languages/<pack>/templates/. */
	templateRel: string;
	/** Relpath under the Target root. */
	targetRel: string;
	executable?: boolean;
};

export type PackageJsonContribution = {
	scripts?: Record<string, string>;
	/** Appended into js-ts Host `gate:fast` when this Pack is selected. */
	gateFragments?: readonly string[];
	devDependencies?: Record<string, string>;
	lintStaged?: Record<string, string[]>;
	enginesNode?: string;
};

/** What one selected Pack adds toward Desired state. */
export type Contribution = {
	rootPlacements: readonly Placement[];
	packagePlacements: readonly Placement[];
	packageJson?: PackageJsonContribution;
};

export type Pack = {
	id: PackId;
	kind: PackKind;
	detect(target: string): boolean;
	contribute(target: string, selected: readonly PackId[]): Contribution;
};
