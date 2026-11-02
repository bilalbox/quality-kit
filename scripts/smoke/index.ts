import type { PackId } from "../packs/types";
import { dartSmoke } from "./dart";
import { jsTsSmoke } from "./js-ts";
import { kotlinAndroidSmoke } from "./kotlin-android";
import { pythonSmoke } from "./python";
import type { HostSmoke } from "./types";

export type { HostSmoke } from "./types";

/**
 * One adoption smoke per Host Pack.
 */
export const HOST_SMOKES: Partial<Record<PackId, HostSmoke>> = {
	"js-ts": jsTsSmoke,
	python: pythonSmoke,
	dart: dartSmoke,
	"kotlin-android": kotlinAndroidSmoke,
};
