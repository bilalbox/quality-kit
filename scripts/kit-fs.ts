import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { PackId, Placement } from "./packs/types";

export const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const languagesRoot = join(kitRoot, "languages");
export const sharedTemplatesRoot = join(languagesRoot, "shared", "templates");

export function packTemplatesRoot(id: PackId): string {
	return join(languagesRoot, id, "templates");
}

/** Kit file a Placement copies from (not used when `p.content` is set). */
export function templatePath(p: Placement): string {
	const root = p.shared ? sharedTemplatesRoot : packTemplatesRoot(p.pack);
	return join(root, p.templateRel);
}

/** Desired file text for a Placement: generated `content`, else the template file. */
export function placementContent(p: Placement): string | null {
	if (p.content !== undefined) return normalize(p.content);
	const path = templatePath(p);
	return existsSync(path) ? normalize(readText(path)) : null;
}

export function readText(path: string): string {
	return readFileSync(path, "utf8");
}

export function normalize(text: string): string {
	return text.replace(/\r\n/g, "\n");
}

/** sha256 hex of text after CRLF→LF normalization (lock file hashes). */
export function contentHash(text: string): string {
	return createHash("sha256").update(normalize(text)).digest("hex");
}

export function ensureDir(path: string): void {
	mkdirSync(dirname(path), { recursive: true });
}

export function copyIfMissing(
	src: string,
	dest: string,
	force = false,
): "copied" | "skipped" | "overwrote" {
	if (existsSync(dest) && !force) return "skipped";
	ensureDir(dest);
	const existed = existsSync(dest);
	writeFileSync(dest, readFileSync(src));
	return existed ? "overwrote" : "copied";
}

export function relToKit(path: string): string {
	return relative(kitRoot, path) || ".";
}
