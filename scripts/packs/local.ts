/**
 * Composed local gate / hooks / root files for selected Host Packs.
 * Host-specific scripts live under tools/quality/<pack>/; shared root files and
 * the top-level gate.sh are generated Placements (see REFERENCE.md).
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { languagesRoot, normalize, readText } from "../kit-fs";
import { AGENTS_MD } from "./placements";
import { packRole } from "./python";
import type { PackId, Placement } from "./types";

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
	if (id === "python" && packRole(packs) === "fragment") return false;
	return isLocalHost(id);
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

function hostTemplate(
	pack: LocalHostId,
	rel: string,
	langsRoot: string,
): string {
	return normalize(readText(join(langsRoot, pack, "templates", rel)));
}

/** Desired top-level tools/quality/gate.sh — null when no bash-gate Host is selected. */
export function composeGateSh(
	hosts: readonly PackId[],
	_opts: ComposeLocalOpts = {},
): string {
	const ordered = localHostsOf(hosts);
	const bash = bashGateHostsOf(ordered);
	if (bash.length === 0) {
		throw new Error("composeGateSh: no bash-gate Host Packs selected");
	}

	const lines = [
		"#!/usr/bin/env bash",
		"# quality-kit composed gate — runs each selected Host's gate.",
		"# Usage: ./tools/quality/gate.sh [fast|full]",
		"# Keep this entrypoint thin: Host gates own step logic (#15 may summarize).",
		"set -euo pipefail",
		"",
		'mode="${1:-full}"',
		'case "${mode}" in',
		"	fast|full) ;;",
		"	*)",
		'		echo "usage: $0 [fast|full]" >&2',
		"		exit 2",
		"		;;",
		"esac",
		"",
		'ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"',
		'cd "${ROOT}"',
		"",
	];

	for (const id of ordered) {
		if (id === "js-ts") {
			lines.push(
				'if [[ "${mode}" == "fast" ]]; then',
				"	pnpm gate:fast",
				"else",
				"	pnpm gate",
				"fi",
				"",
			);
		} else if (isBashGateHost(id)) {
			lines.push(`"./tools/quality/${id}/gate.sh" "\${mode}"`, "");
		}
	}

	return `${lines.join("\n").replace(/\n+$/, "\n")}`;
}

/** Single Host → Host template. Several → one secrets + per-Host format + top-level gate. */
export function composeLefthook(
	hosts: readonly PackId[],
	opts: ComposeLocalOpts = {},
): string {
	const langsRoot = opts.languagesRoot ?? languagesRoot;
	const lefthookHosts = lefthookHostsOf(hosts);
	if (lefthookHosts.length === 0) {
		throw new Error("composeLefthook: no lefthook Host Packs selected");
	}
	const includeJsTs = hosts.includes("js-ts");

	if (lefthookHosts.length === 1 && !includeJsTs) {
		return hostTemplate(lefthookHosts[0]!, "lefthook.yml", langsRoot);
	}

	const formatBlocks: string[] = [];
	for (const id of lefthookHosts) {
		const raw = hostTemplate(id, "lefthook.yml", langsRoot);
		const format = raw.match(
			/    format:\n(?:      .*\n)+/,
		);
		if (!format) {
			throw new Error(`${id} lefthook.yml: missing format command`);
		}
		formatBlocks.push(
			format[0]!.replace(/^    format:/m, `    format-${id}:`),
		);
	}

	const lines = [
		`# quality-kit composed hooks (${[...lefthookHosts, ...(includeJsTs ? ["js-ts"] : [])].join(" + ")}) — install with: lefthook install`,
		"",
		"pre-commit:",
		"  parallel: false",
		"  commands:",
		"    secrets:",
		"      run: ./tools/quality/run-secret-scan.sh --staged",
	];
	for (const block of formatBlocks) {
		lines.push(block.replace(/\n$/, ""));
	}
	if (includeJsTs) {
		lines.push(
			"    lint-staged:",
			"      run: pnpm exec lint-staged",
		);
	}
	lines.push(
		"",
		"pre-push:",
		"  commands:",
		"    gate:",
		"      run: ./tools/quality/gate.sh full",
		"",
	);
	return `${lines.join("\n")}`;
}

type EditorSection = { header: string; lines: string[] };

function editorconfigSections(text: string): EditorSection[] {
	const sections: EditorSection[] = [];
	let header = "";
	let body: string[] = [];
	const flush = () => {
		sections.push({ header, lines: body });
		body = [];
	};
	for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
		if (/^\[.+\]$/.test(line)) {
			flush();
			header = line;
			continue;
		}
		body.push(line);
	}
	flush();
	return sections;
}

function sectionText(s: EditorSection): string {
	if (s.header === "") return s.lines.join("\n");
	return [s.header, ...s.lines].join("\n");
}

/** First Host wins on duplicate section headers (including the preamble). */
export function composeEditorconfig(
	hosts: readonly PackId[],
	opts: ComposeLocalOpts = {},
): string {
	const langsRoot = opts.languagesRoot ?? languagesRoot;
	const local = localHostsOf(hosts);
	if (local.length === 0) {
		throw new Error("composeEditorconfig: no local Host Packs selected");
	}
	if (local.length === 1) {
		return hostTemplate(local[0]!, ".editorconfig", langsRoot);
	}

	const seen = new Set<string>();
	const out: string[] = [];
	for (const id of local) {
		for (const section of editorconfigSections(
			hostTemplate(id, ".editorconfig", langsRoot),
		)) {
			const key = section.header === "" ? "<preamble>" : section.header;
			if (seen.has(key)) continue;
			seen.add(key);
			const text = sectionText(section).replace(/\n+$/, "");
			if (text.length > 0) out.push(text);
		}
	}
	return `${out.join("\n\n")}\n`;
}

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
	const langsRoot = opts.languagesRoot ?? languagesRoot;
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
		parts.push(`### ${id}`, "", agentsBody(hostTemplate(id, "AGENTS.quality.md", langsRoot)), "");
	}
	return `${parts.join("\n").replace(/\n+$/, "\n")}`;
}

/** Union Host Makefile targets; gate / gate-fast always call the composed top-level gate. */
export function composeMakefile(
	hosts: readonly PackId[],
	opts: ComposeLocalOpts = {},
): string {
	const langsRoot = opts.languagesRoot ?? languagesRoot;
	const makefileHosts = lefthookHostsOf(hosts);
	if (makefileHosts.length === 0) {
		throw new Error("composeMakefile: no Makefile Host Packs selected");
	}
	if (makefileHosts.length === 1) {
		return hostTemplate(makefileHosts[0]!, "Makefile", langsRoot);
	}

	const lines = [
		`# quality-kit composed gates (${makefileHosts.join(" + ")}) — see AGENTS.quality.md`,
		"SHELL := /bin/bash",
		"ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))",
		"QUALITY := $(ROOT)/tools/quality",
		"",
		".PHONY: gate gate-fast format secrets vulns help",
		"",
		"help:",
		'\t@echo "Targets:"',
		'\t@echo "  make gate-fast  ./tools/quality/gate.sh fast (every selected Host)"',
		'\t@echo "  make gate       ./tools/quality/gate.sh full (every selected Host)"',
		'\t@echo "  make format     each Host\'s format check"',
		'\t@echo "  make secrets    Betterleaks scan"',
		'\t@echo "  make vulns      osv-scanner lockfile scan"',
		"",
		"gate-fast:",
		"\t@$(QUALITY)/gate.sh fast",
		"",
		"gate:",
		"\t@$(QUALITY)/gate.sh full",
		"",
		"format:",
	];
	for (const id of makefileHosts) {
		lines.push(`\t@$(QUALITY)/${id}/run-format.sh`);
	}
	lines.push(
		"",
		"secrets:",
		"\t@$(QUALITY)/run-secret-scan.sh",
		"",
		"vulns:",
		"\t@$(QUALITY)/run-vuln-scan.sh",
		"",
	);

	// Host-only targets (analyze/test/doctor/…) keep Pack-prefixed names when they collide.
	for (const id of makefileHosts) {
		const raw = hostTemplate(id, "Makefile", langsRoot);
		const skip = new Set([
			"gate",
			"gate-fast",
			"format",
			"format-fix",
			"secrets",
			"vulns",
			"help",
		]);
		for (const match of raw.matchAll(
			/^([a-z][a-z0-9-]*):\n((?:\t.*\n)+)/gm,
		)) {
			const name = match[1]!;
			if (skip.has(name)) continue;
			const body = match[2]!;
			lines.push(`${name}:`, body.replace(/\n$/, ""), "");
		}
	}

	return `${lines.join("\n").replace(/\n+$/, "\n")}`;
}

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
): Placement[] {
	const local = localHostsOf(packs);
	if (local.length === 0) return [];

	const out: Placement[] = [];
	const label = local[0]!;

	out.push(
		ownedGenerated(label, ".editorconfig", composeEditorconfig(packs)),
	);

	const agentsContent = composeAgentsQuality(packs);
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

	return out;
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
