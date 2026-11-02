import type { PackId, PackKind } from "./types";

/**
 * Selection-dependent Pack kind. Canonical `Pack.kind` stays static (`host` for
 * python); Fragment-vs-Host for python is decided here / inside `contribute`.
 * See GLOSSARY.md Fragment Pack.
 */
const STATIC_KIND: Record<PackId, PackKind> = {
	"js-ts": "host",
	python: "host",
	rust: "host",
	dart: "host",
	"kotlin-android": "host",
};

export function effectiveKind(
	id: PackId,
	selected: readonly PackId[],
): PackKind {
	if (id === "python") {
		return selected.includes("js-ts") ? "fragment" : "host";
	}
	return STATIC_KIND[id];
}

export function actsAsHost(
	id: PackId,
	selected: readonly PackId[],
): boolean {
	return effectiveKind(id, selected) === "host";
}
