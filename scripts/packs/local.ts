/**
 * Composed local gate / hooks / root files for selected Host Packs.
 * Host-specific scripts live under tools/quality/<pack>/; shared root files and
 * the top-level gate.sh are generated Placements (see REFERENCE.md).
 *
 * Composers live in sibling modules; this file orchestrates Desired Placements
 * and re-exports the public composition surface for callers/tests.
 */

import { agentsAgentHooksSection, composeAgentsQuality } from "./compose-agents";
import {
	composeAgentHooksSettings,
	composeAgentHooksSh,
} from "./compose-agent-hooks";
import { composeEditorconfig } from "./compose-editorconfig";
import { composeGateSh } from "./compose-gate";
import { composeLefthook } from "./compose-lefthook";
import { composeMakefile } from "./compose-makefile";
import {
	bashGateHostsOf,
	lefthookHostsOf,
	localHostsOf,
} from "./local-hosts";
import { AGENTS_MD } from "./placements";
import type { PackId, Placement } from "./types";

export {
	BASH_GATE_HOST_IDS,
	type BashGateHostId,
	bashGateHostsOf,
	type ComposeLocalOpts,
	hostHasLefthookTemplate,
	isBashGateHost,
	isLefthookHost,
	isLocalHost,
	LEFTHOOK_HOST_IDS,
	type LefthookHostId,
	lefthookHostsOf,
	LOCAL_HOST_IDS,
	type LocalHostId,
	localHostsOf,
} from "./local-hosts";
export { composeGateSh } from "./compose-gate";
export { composeLefthook } from "./compose-lefthook";
export { composeEditorconfig } from "./compose-editorconfig";
export { composeAgentsQuality } from "./compose-agents";
export { composeMakefile } from "./compose-makefile";
export {
	AGENT_HOOKS_DESCRIPTION,
	composeAgentHooksSettings,
	composeAgentHooksSh,
} from "./compose-agent-hooks";

export type ComposeLocalPlacementsOpts = {
	/** Opt-in Claude Code agent hooks (#20). */
	agentHooks?: boolean;
};

function ownedGenerated(
	pack: PackId,
	targetRel: string,
	content: string,
	executable?: true,
): Placement {
	return {
		pack,
		templateRel: targetRel,
		targetRel,
		kind: "owned",
		content,
		executable,
	};
}

/**
 * Generated local Placements for the selection: top-level gate, lefthook,
 * .editorconfig, AGENTS.quality.md, Makefile. Labelled with the first Host
 * that contributes each file.
 */
export function composedLocalPlacements(
	packs: readonly PackId[],
	opts: ComposeLocalPlacementsOpts = {},
): Placement[] {
	const local = localHostsOf(packs);
	if (local.length === 0) return [];

	const out: Placement[] = [];
	const label = local[0]!;
	const agentHooks = opts.agentHooks === true;

	out.push(
		ownedGenerated(label, ".editorconfig", composeEditorconfig(packs)),
	);

	let agentsContent = composeAgentsQuality(packs);
	if (agentHooks) {
		agentsContent = `${agentsContent.replace(/\n+$/, "\n")}\n${agentsAgentHooksSection(packs)}`;
	}
	out.push({
		pack: label,
		templateRel: "AGENTS.quality.md",
		targetRel: "AGENTS.quality.md",
		kind: "merge-into",
		mergeInto: AGENTS_MD,
		content: agentsContent,
	});

	const bash = bashGateHostsOf(packs);
	if (bash.length > 0) {
		out.push(
			ownedGenerated(
				bash[0]!,
				"tools/quality/gate.sh",
				composeGateSh(packs),
				true,
			),
		);
	}

	const lefthook = lefthookHostsOf(packs);
	if (lefthook.length > 0) {
		out.push(
			ownedGenerated(
				lefthook[0]!,
				"lefthook.yml",
				composeLefthook(packs),
			),
		);
		out.push({
			pack: lefthook[0]!,
			templateRel: "Makefile",
			targetRel: "Makefile",
			kind: "merge-into",
			mergeInto: { dest: "Makefile", markers: ["gate-fast:", "gate:"] },
			content: composeMakefile(packs),
		});
	}

	if (agentHooks) {
		out.push(
			ownedGenerated(
				label,
				".claude/settings.json",
				composeAgentHooksSettings(packs),
			),
		);
		out.push(
			ownedGenerated(
				label,
				"tools/quality/agent-hooks.sh",
				composeAgentHooksSh(packs),
				true,
			),
		);
	}

	return out;
}
