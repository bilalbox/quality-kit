export const PACK_IDS = ["js-ts", "python", "rust", "dart", "kotlin-android"] as const;
export type PackId = (typeof PACK_IDS)[number];

export type PackKind = "host" | "fragment";

/** How audit judges a Placement (see GLOSSARY.md "Placement kind"). */
export type PlacementKind = "owned" | "seed" | "merge-into";

/** Where merge-into content must land, and the lines that prove it did. */
export type MergeInto = {
	/** Relpath under the Target root; may equal the Placement's targetRel. */
	dest: string;
	/** Each must start some line of dest (leading whitespace ignored). */
	markers: readonly string[];
};

type PlacementBase = {
	pack: PackId;
	/** Relpath under languages/<pack>/templates/. */
	templateRel: string;
	/** Relpath under the Target root. */
	targetRel: string;
	executable?: boolean;
};

/** One template → Target path mapping contributed by a Pack. */
export type Placement = PlacementBase &
	(
		| { kind: "owned" | "seed" }
		| { kind: "merge-into"; mergeInto: MergeInto }
	);

export type PackageJsonContribution = {
	scripts?: Record<string, string>;
	/** Appended into js-ts Host `gate:fast` when this Pack is selected. */
	gateFragments?: readonly string[];
	devDependencies?: Record<string, string>;
	lintStaged?: Record<string, string[]>;
	enginesNode?: string;
};

/** One piece of wiring a probe found missing, and how to add it. */
export type WiringGap = {
	/** Where the gap is (e.g. a module build file); omitted for Target-wide gaps. */
	detail?: string;
	fix: string;
};

/** Checks that the Target actually runs the gate, beyond its files being present. */
export type WiringProbe = {
	/** What wired looks like, e.g. "root build applies quality-kit.root". */
	label: string;
	/** Empty when wired. */
	check(target: string): readonly WiringGap[];
};

/** What one selected Pack adds toward Desired state. */
export type Contribution = {
	rootPlacements: readonly Placement[];
	packagePlacements: readonly Placement[];
	packageJson?: PackageJsonContribution;
	/** Ordered steps the user runs after apply; empty for stub Packs. */
	nextSteps: readonly string[];
	/** Wiring audit checks; empty for Packs without a gate of their own. */
	probes: readonly WiringProbe[];
};

export type Pack = {
	id: PackId;
	kind: PackKind;
	detect(target: string): boolean;
	contribute(target: string, selected: readonly PackId[]): Contribution;
};
