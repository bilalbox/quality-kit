import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { kitRoot } from "../scripts/kit-fs";
import { loadPins, pinDrift } from "../scripts/pins";

test("pins: pins.json is the single pins source at the kit root", () => {
	assert.ok(
		existsSync(join(kitRoot, "pins.json")),
		"expected pins.json at the kit root",
	);
	const pins = loadPins();
	assert.equal(pins.biome, "2.6.3");
	assert.equal(pins.flutter, "3.47.9");
	assert.equal(pins.betterleaks.version, "1.9.0");
	assert.equal(pins.shellcheck.version, "0.11.0");
	assert.equal(pins.actionlint.version, "1.7.12");
});

test("pins: every template and doc pin literal matches pins.json", () => {
	const drift = pinDrift();
	assert.deepEqual(
		drift,
		[],
		drift.map((d) => `${d.file}: ${d.detail}`).join("\n"),
	);
});

test("pins: js-ts Biome is an exact pin; other Target devDeps may use carets", () => {
	const pins = loadPins();
	const biome = pins.jsTsDevDependencies["@biomejs/biome"];
	assert.ok(biome, "pins.json must declare @biomejs/biome");
	assert.equal(biome.range, "exact");
	assert.equal(biome.version, pins.biome);
	for (const [name, spec] of Object.entries(pins.jsTsDevDependencies)) {
		if (name === "@biomejs/biome") continue;
		assert.equal(spec.range, "caret", `${name} should allow caret ranges`);
	}
	const manifest = JSON.parse(
		readFileSync(
			join(
				kitRoot,
				"languages/js-ts/templates/package.devDependencies.json",
			),
			"utf8",
		),
	) as Record<string, string>;
	assert.equal(manifest["@biomejs/biome"], pins.biome);
	for (const [name, spec] of Object.entries(pins.jsTsDevDependencies)) {
		if (name === "@biomejs/biome") continue;
		assert.equal(manifest[name], `^${spec.version}`);
	}
});
