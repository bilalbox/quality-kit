import {
	bashGateHostsOf,
	type ComposeLocalOpts,
	hostTemplate,
	localHostsOf,
	resolveLangsRoot,
} from "./local-hosts";
import type { PackId } from "./types";

/** Strip the shared DoD heading so multi-Host composition can re-emit it once. */
function agentsBody(text: string): string {
	const normalized = text.replace(/\r\n/g, "\n");
	const withoutHeading = normalized.replace(
		/^## Definition of Done \(Mandatory Gate\)\n+/,
		"",
	);
	return withoutHeading.replace(/\n+$/, "");
}

export function composeAgentsQuality(
	hosts: readonly PackId[],
	opts: ComposeLocalOpts = {},
): string {
	const langsRoot = resolveLangsRoot(opts);
	const local = localHostsOf(hosts);
	if (local.length === 0) {
		throw new Error("composeAgentsQuality: no local Host Packs selected");
	}
	if (local.length === 1) {
		return hostTemplate(local[0]!, "AGENTS.quality.md", langsRoot);
	}

	const hasBash = bashGateHostsOf(local).length > 0;
	const intro = hasBash
		? "Before considering any code change or task done (even when not pushing), **always run `./tools/quality/gate.sh fast` first** (or `make gate-fast` / `pnpm gate:fast` when wired). `./tools/quality/gate.sh full` runs every selected Host's full gate (CI and pre-push)."
		: "Before considering any code change or task done (even when not pushing), **run `pnpm fix`, then `pnpm gate:fast`**.";

	const parts = [
		"## Definition of Done (Mandatory Gate)",
		"",
		intro,
		"",
	];
	for (const id of local) {
		parts.push(
			`### ${id}`,
			"",
			agentsBody(hostTemplate(id, "AGENTS.quality.md", langsRoot)),
			"",
		);
	}
	return `${parts.join("\n").replace(/\n+$/, "\n")}`;
}

export function agentsAgentHooksSection(hosts: readonly PackId[]): string {
	const gate =
		bashGateHostsOf(hosts).length > 0
			? "`./tools/quality/gate.sh fast`"
			: "`pnpm gate:fast`";
	return [
		"### Agent hooks (opt-in)",
		"",
		`Applied with \`pnpm apply -- --agent-hooks\`: Claude Code project hooks in \`.claude/settings.json\` enforce this Definition of Done. After each \`Edit\`/\`Write\`, format/lint **only the changed file** (Host tools by extension). On \`Stop\`, run the top-level ${gate} and **block** finishing when it fails (failure output is shown to the agent). Helper: \`tools/quality/agent-hooks.sh\`.`,
		"",
	].join("\n");
}
