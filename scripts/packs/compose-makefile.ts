import {
	type ComposeLocalOpts,
	hostTemplate,
	lefthookHostsOf,
	resolveLangsRoot,
} from "./local-hosts";
import type { PackId } from "./types";

/** Union Host Makefile targets; gate / gate-fast always call the composed top-level gate. */
export function composeMakefile(
	hosts: readonly PackId[],
	opts: ComposeLocalOpts = {},
): string {
	const langsRoot = resolveLangsRoot(opts);
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
