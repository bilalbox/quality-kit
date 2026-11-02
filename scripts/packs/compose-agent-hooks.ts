import { bashGateHostsOf, localHostsOf } from "./local-hosts";
import type { PackId } from "./types";

/** Marker description so audit can recognise kit-owned agent hook settings. */
export const AGENT_HOOKS_DESCRIPTION =
	"quality-kit agent hooks: PostToolUse format/lint on the edited file; Stop runs the top-level gate fast";

/**
 * Claude Code project settings (`.claude/settings.json`) that call the composed
 * `tools/quality/agent-hooks.sh`. Same content for every Host selection.
 */
export function composeAgentHooksSettings(
	_hosts: readonly PackId[] = [],
): string {
	const settings = {
		description: AGENT_HOOKS_DESCRIPTION,
		hooks: {
			PostToolUse: [
				{
					matcher: "Edit|Write",
					hooks: [
						{
							type: "command",
							command:
								'"$CLAUDE_PROJECT_DIR"/tools/quality/agent-hooks.sh post-edit',
							timeout: 60,
							statusMessage: "Checking edited file",
						},
					],
				},
			],
			Stop: [
				{
					hooks: [
						{
							type: "command",
							command:
								'"$CLAUDE_PROJECT_DIR"/tools/quality/agent-hooks.sh stop',
							timeout: 300,
							statusMessage: "Running gate fast",
						},
					],
				},
			],
		},
	};
	return `${JSON.stringify(settings, null, "\t")}\n`;
}

/** Top-level gate fast command for the selection (never a Host-namespaced gate). */
function agentHooksGateFastCmd(hosts: readonly PackId[]): string {
	if (bashGateHostsOf(hosts).length > 0) {
		return '"./tools/quality/gate.sh" fast';
	}
	if (hosts.includes("js-ts")) {
		return "pnpm gate:fast";
	}
	throw new Error("composeAgentHooksSh: no local Host Packs selected");
}

/**
 * Composed helper invoked by Claude Code hooks. `post-edit` checks only the
 * changed file (routed by extension per selected Host); `stop` runs top-level
 * gate fast and exits 2 on failure so Claude is blocked with the output.
 */
export function composeAgentHooksSh(hosts: readonly PackId[]): string {
	const local = localHostsOf(hosts);
	if (local.length === 0) {
		throw new Error("composeAgentHooksSh: no local Host Packs selected");
	}
	const gateCmd = agentHooksGateFastCmd(local);
	const hasJsTs = local.includes("js-ts");
	const hasPython = local.includes("python");
	const hasDart = local.includes("dart");
	const hasKotlin = local.includes("kotlin-android");

	const postEditBranches: string[] = [];
	if (hasJsTs) {
		postEditBranches.push(
			"\t.js|.cjs|.mjs|.jsx|.ts|.cts|.mts|.tsx|.json|.jsonc)",
			'\t\trel="${file_path#"${ROOT}"/}"',
			'\t\tpnpm exec biome check --write --no-errors-on-unmatched "${rel}"',
			"\t\t;;",
		);
	}
	if (hasPython) {
		postEditBranches.push(
			"\t.py)",
			'\t\trel="${file_path#"${ROOT}"/}"',
			'\t\t"./tools/quality/python/run-format.sh" --fix "${rel}"',
			"\t\t;;",
		);
	}
	if (hasDart) {
		postEditBranches.push(
			"\t.dart)",
			'\t\trel="${file_path#"${ROOT}"/}"',
			'\t\t"./tools/quality/dart/run-format.sh" --fix "${rel}"',
			"\t\t;;",
		);
	}
	if (hasKotlin) {
		postEditBranches.push(
			"\t.kt|.kts)",
			'\t\trel="${file_path#"${ROOT}"/}"',
			'\t\t"./tools/quality/kotlin-android/run-format.sh" --fix "${rel}"',
			"\t\t;;",
		);
	}

	const lines = [
		"#!/usr/bin/env bash",
		"# quality-kit agent hooks — Claude Code PostToolUse / Stop helper.",
		"# Usage: ./tools/quality/agent-hooks.sh post-edit|stop",
		"# Reads Claude Code hook JSON on stdin. Keep thin: Host gates own step logic.",
		"set -euo pipefail",
		"",
		'ROOT="${CLAUDE_PROJECT_DIR:-}"',
		'if [[ -z "${ROOT}" ]]; then',
		'	ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"',
		"fi",
		'cd "${ROOT}"',
		"",
		'mode="${1:-}"',
		'case "${mode}" in',
		"	post-edit|stop) ;;",
		"	*)",
		'		echo "usage: $0 post-edit|stop" >&2',
		"		exit 2",
		"		;;",
		"esac",
		"",
		"# Parse Claude Code hook JSON without jq (not assumed on Target PATH).",
		"hook_json=$(cat)",
		"parse_hook() {",
		'	local key="$1"',
		"	if command -v python3 >/dev/null 2>&1; then",
		"		printf '%s' \"${hook_json}\" | python3 -c '",
		"import json, sys",
		"d = json.load(sys.stdin)",
		'cur = d',
		"for p in sys.argv[1].split(\".\"):",
		"    cur = cur.get(p) if isinstance(cur, dict) else None",
		'print("" if cur is None else cur)',
		"' \"${key}\"",
		"	elif command -v node >/dev/null 2>&1; then",
		"		printf '%s' \"${hook_json}\" | node -e '",
		'const fs = require("fs");',
		"const d = JSON.parse(fs.readFileSync(0, \"utf8\"));",
		"let cur = d;",
		"for (const p of process.argv[1].split(\".\")) cur = cur == null ? undefined : cur[p];",
		'process.stdout.write(cur == null || cur === undefined ? "" : String(cur));',
		"' \"${key}\"",
		"	else",
		'		echo "agent-hooks: need python3 or node to parse hook JSON" >&2',
		"		exit 2",
		"	fi",
		"}",
		"",
		'if [[ "${mode}" == "stop" ]]; then',
		'	active="$(parse_hook stop_hook_active || true)"',
		'	if [[ "${active,,}" == "true" ]]; then',
		"		exit 0",
		"	fi",
		"	set +e",
		`	out=$(${gateCmd} 2>&1)`,
		"	status=$?",
		"	set -e",
		'	if [[ "${status}" -ne 0 ]]; then',
		'		echo "${out}" >&2',
		'		echo "agent-hooks: top-level gate fast failed; fix before finishing." >&2',
		"		exit 2",
		"	fi",
		"	exit 0",
		"fi",
		"",
		"# post-edit: format/lint the single edited file only.",
		'file_path="$(parse_hook tool_input.file_path || true)"',
		'if [[ -z "${file_path}" ]]; then',
		"	exit 0",
		"fi",
		'file_path="${file_path//\\\\//}"',
		'ext=".${file_path##*.}"',
		'case "${ext}" in',
		...postEditBranches,
		"	*)",
		"		exit 0",
		"		;;",
		"esac",
		"",
	];

	return `${lines.join("\n").replace(/\n+$/, "\n")}`;
}
