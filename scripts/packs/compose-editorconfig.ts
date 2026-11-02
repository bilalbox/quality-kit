import {
	type ComposeLocalOpts,
	hostTemplate,
	localHostsOf,
	resolveLangsRoot,
} from "./local-hosts";
import type { PackId } from "./types";

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
	const langsRoot = resolveLangsRoot(opts);
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
