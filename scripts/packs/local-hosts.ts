/**
 * Which selected Packs participate in local gate / hooks composition.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { languagesRoot, normalize, readText } from "../kit-fs";
import { actsAsHost } from "./effective-kind";
import type { PackId } from "./types";

/** Host Packs that participate in local-gate composition. */
export const LOCAL_HOST_IDS = ["js-ts", "python", "dart", "kotlin-android"] as const;
export type LocalHostId = (typeof LOCAL_HOST_IDS)[number];

/** Hosts whose gate is a bash script under tools/quality/<pack>/. */
export const BASH_GATE_HOST_IDS = ["python", "dart", "kotlin-android"] as const;
export type BashGateHostId = (typeof BASH_GATE_HOST_IDS)[number];

/** Hosts that ship lefthook.yml / Makefile composition inputs. */
export const LEFTHOOK_HOST_IDS = ["python", "dart", "kotlin-android"] as const;
export type LefthookHostId = (typeof LEFTHOOK_HOST_IDS)[number];

export function isLocalHost(id: PackId): id is LocalHostId {
	return (LOCAL_HOST_IDS as readonly string[]).includes(id);
}

export function isBashGateHost(id: PackId): id is BashGateHostId {
	return (BASH_GATE_HOST_IDS as readonly string[]).includes(id);
}

export function isLefthookHost(id: PackId): id is LefthookHostId {
	return (LEFTHOOK_HOST_IDS as readonly string[]).includes(id);
}

/** python is a Local Host only when not Fragment onto js-ts. */
function actsAsLocalHost(id: PackId, packs: readonly PackId[]): boolean {
	return isLocalHost(id) && actsAsHost(id, packs);
}

export function localHostsOf(packs: readonly PackId[]): LocalHostId[] {
	return packs.filter((id): id is LocalHostId => actsAsLocalHost(id, packs));
}

export function bashGateHostsOf(packs: readonly PackId[]): BashGateHostId[] {
	return packs.filter(
		(id): id is BashGateHostId =>
			actsAsLocalHost(id, packs) && isBashGateHost(id),
	);
}

export function lefthookHostsOf(packs: readonly PackId[]): LefthookHostId[] {
	return packs.filter(
		(id): id is LefthookHostId =>
			actsAsLocalHost(id, packs) && isLefthookHost(id),
	);
}

export type ComposeLocalOpts = {
	languagesRoot?: string;
};

export function hostTemplate(
	pack: LocalHostId,
	rel: string,
	langsRoot: string,
): string {
	return normalize(readText(join(langsRoot, pack, "templates", rel)));
}

export function resolveLangsRoot(opts: ComposeLocalOpts): string {
	return opts.languagesRoot ?? languagesRoot;
}

/** Whether a Host still ships a lefthook composition input under its templates. */
export function hostHasLefthookTemplate(
	pack: PackId,
	langsRoot: string = languagesRoot,
): boolean {
	return (
		isLefthookHost(pack) &&
		existsSync(join(langsRoot, pack, "templates", "lefthook.yml"))
	);
}
