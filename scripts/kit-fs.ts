import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { PackId } from "./packs/types";

export const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const languagesRoot = join(kitRoot, "languages");

export function packTemplatesRoot(id: PackId): string {
	return join(languagesRoot, id, "templates");
}

export function readText(path: string): string {
	return readFileSync(path, "utf8");
}

export function normalize(text: string): string {
	return text.replace(/\r\n/g, "\n");
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
