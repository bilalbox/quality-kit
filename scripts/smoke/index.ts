import type { PackId } from "../packs/types";
import { dartSmoke } from "./dart";
import { jsTsSmoke } from "./js-ts";
import { kotlinAndroidSmoke } from "./kotlin-android";
import type { SmokeRecipe } from "./types";

export type { SmokeRecipe } from "./types";

/**
 * One adoption smoke per Host Pack.
 *
 * python: the python Host Pack (#17) adds `scripts/smoke/python.ts` (scaffold
 * with `uv init`), registers it here, and adds `.github/workflows/smoke-python.yml`.
 */
export const SMOKE_RECIPES: Partial<Record<PackId, SmokeRecipe>> = {
	"js-ts": jsTsSmoke,
	dart: dartSmoke,
	"kotlin-android": kotlinAndroidSmoke,
	// python — filled by #17
};
