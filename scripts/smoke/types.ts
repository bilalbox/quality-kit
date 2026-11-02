/** How one Host Pack is adopted into a freshly scaffolded project. */
export type SmokeRecipe = {
	/** Executables the recipe needs on PATH (checked before anything runs). */
	tools: readonly string[];
	/** Create the upstream project at `target` (a path that does not exist yet). */
	scaffold(target: string): void;
	/** The Pack's Post-apply steps, done the way an adopter would. Runs without `CI`. */
	wire(target: string): void;
	/** What the Target's CI quality-gate runs (`gate full`), in order. Runs with `CI=true`. */
	gate: readonly (readonly string[])[];
};
