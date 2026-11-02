import type { PackId } from "../packs/types";
import { dartSmoke } from "./dart";
import { jsTsSmoke } from "./js-ts";
import { kotlinAndroidSmoke } from "./kotlin-android";
import { pythonSmoke } from "./python";
import type { SmokeRecipe } from "./types";

export type { SmokeRecipe } from "./types";

/**
 * One adoption smoke per Host Pack.
 */
export const SMOKE_RECIPES: Partial<Record<PackId, SmokeRecipe>> = {
	"js-ts": jsTsSmoke,
	python: pythonSmoke,
	dart: dartSmoke,
	"kotlin-android": kotlinAndroidSmoke,
};
