import {
	bashGateHostsOf,
	type ComposeLocalOpts,
	isBashGateHost,
	localHostsOf,
} from "./local-hosts";
import type { PackId } from "./types";

/** Desired top-level tools/quality/gate.sh — throws when no bash-gate Host is selected. */
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
		"# Keep this entrypoint thin: each Host gate runs all steps then summarizes.",
		"set -euo pipefail",
		"",
		'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
		"# shellcheck source=gate-lib.sh",
		'source "${SCRIPT_DIR}/gate-lib.sh"',
		"",
		'mode="${1:-full}"',
		"quality_gate_require_mode",
		"",
		'ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"',
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
