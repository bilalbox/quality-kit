/**
 * Composed CI workflow for selected Host Packs.
 * Each Host keeps its job steps in templates/.github/workflows/ci.yml; multi-Host
 * Targets get one workflow whose jobs are those Hosts' `ci` jobs, renamed to the Pack id.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { languagesRoot, normalize, readText } from "../kit-fs";
import { actsAsHost } from "./effective-kind";
import type { PackId, Placement } from "./types";

/** Host Packs that ship a CI workflow template. */
export const CI_HOST_IDS = ["js-ts", "python", "dart", "kotlin-android"] as const;
export type CiHostId = (typeof CI_HOST_IDS)[number];

export function isCiHost(id: PackId): id is CiHostId {
	return (CI_HOST_IDS as readonly string[]).includes(id);
}

/** Selected Packs that contribute a CI job, in selection order. */
export function ciHostsOf(packs: readonly PackId[]): CiHostId[] {
	return packs.filter(
		(id): id is CiHostId => isCiHost(id) && actsAsHost(id, packs),
	);
}

export type ComposeCiOpts = {
	/** Kit `languages/` dir; defaults to this checkout's `languages/`. */
	languagesRoot?: string;
};

function hostWorkflowPath(pack: CiHostId, langsRoot: string): string {
	return join(langsRoot, pack, "templates", ".github/workflows/ci.yml");
}

/** Full single-Host workflow text (the composition input). */
export function hostCiWorkflow(
	pack: CiHostId,
	langsRoot: string = languagesRoot,
): string {
	return normalize(readText(hostWorkflowPath(pack, langsRoot)));
}

/**
 * Body of `jobs.ci` (lines after `  ci:`), including the trailing newline.
 * Host templates must keep a single job named `ci`.
 */
function hostCiJobBody(pack: CiHostId, langsRoot: string): string {
	const lines = hostCiWorkflow(pack, langsRoot).split("\n");
	const jobsAt = lines.indexOf("jobs:");
	if (jobsAt === -1) {
		throw new Error(`${pack} ci.yml: missing top-level jobs:`);
	}
	const ciAt = lines.findIndex((l, i) => i > jobsAt && l === "  ci:");
	if (ciAt === -1) {
		throw new Error(`${pack} ci.yml: missing jobs.ci`);
	}
	const body: string[] = [];
	for (let i = ciAt + 1; i < lines.length; i++) {
		const line = lines[i]!;
		if (line !== "" && /^  \S/.test(line)) break;
		if (line !== "" && /^\S/.test(line)) break;
		body.push(line);
	}
	while (body.length > 0 && body[body.length - 1] === "") body.pop();
	return `${body.join("\n")}\n`;
}

/** Shared workflow header taken from the first Host (headers are identical today). */
function workflowHeader(pack: CiHostId, langsRoot: string): string {
	const text = hostCiWorkflow(pack, langsRoot);
	const idx = text.indexOf("\njobs:\n");
	if (idx === -1) {
		throw new Error(`${pack} ci.yml: missing jobs: block`);
	}
	return text.slice(0, idx + 1);
}

/**
 * Desired `.github/workflows/ci.yml` for the selected CI Hosts.
 * One Host → that Host's template verbatim. Several → one workflow, one job per Host.
 */
export function composeCiWorkflow(
	hosts: readonly PackId[],
	opts: ComposeCiOpts = {},
): string {
	const langsRoot = opts.languagesRoot ?? languagesRoot;
	const ciHosts = ciHostsOf(hosts);
	if (ciHosts.length === 0) {
		throw new Error("composeCiWorkflow: no CI Host Packs selected");
	}
	if (ciHosts.length === 1) return hostCiWorkflow(ciHosts[0]!, langsRoot);

	const parts = [workflowHeader(ciHosts[0]!, langsRoot), "jobs:\n"];
	for (const id of ciHosts) {
		parts.push(`  ${id}:\n`, hostCiJobBody(id, langsRoot));
		if (id !== ciHosts[ciHosts.length - 1]) parts.push("\n");
	}
	return parts.join("");
}

/** Owned Placement for the composed workflow; labelled with the first CI Host. */
export function composedCiPlacement(packs: readonly PackId[]): Placement | null {
	const hosts = ciHostsOf(packs);
	if (hosts.length === 0) return null;
	return {
		pack: hosts[0]!,
		templateRel: ".github/workflows/ci.yml",
		targetRel: ".github/workflows/ci.yml",
		kind: "owned",
		content: composeCiWorkflow(hosts),
	};
}

/** True when this Placement's Desired content is generated, not read from a template file. */
export function isGenerated(p: Placement): boolean {
	return p.content !== undefined;
}

/** Whether a Host still ships a ci.yml composition input under its templates. */
export function hostHasCiTemplate(
	pack: PackId,
	langsRoot: string = languagesRoot,
): boolean {
	return isCiHost(pack) && existsSync(hostWorkflowPath(pack, langsRoot));
}
