import {
	type ComposeLocalOpts,
	hostTemplate,
	lefthookHostsOf,
	resolveLangsRoot,
} from "./local-hosts";
import type { PackId } from "./types";

/** Single Host → Host template. Several → one secrets + per-Host format + top-level gate. */
export function composeLefthook(
	hosts: readonly PackId[],
	opts: ComposeLocalOpts = {},
): string {
	const langsRoot = resolveLangsRoot(opts);
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
		const format = raw.match(/    format:\n(?:      .*\n)+/);
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
