## Definition of Done (Mandatory Gate)

Before considering any code change or task done (even when not pushing), **run `pnpm fix`, then `pnpm gate:fast`**.

`pnpm fix` applies Biome's safe fixes repo-wide (format, imports, safe lint fixes). Fix whatever the gate still reports by hand.

Do not declare completion with only piecemeal checks (`biome`, bare `tsc --noEmit`, or a single lint script). `pnpm gate:fast` bundles:

1. `lint` (Biome format + lint, including type-aware rules for floating/misused promises, `any` returns and non-exhaustive switches; fails on any error, warning or info not in `baselines/biome-diagnostics.json`). Await or return every promise; for deliberate fire-and-forget write `void promise` or attach `.catch(...)`.
2. `lint:secrets` (`betterleaks` — secrets, tokens, API key leaks)
3. `lint:graph` (`rev-dep` — cycles, orphans, unused exports/deps, duplicates)
4. `lint:complexity` (Biome cognitive-complexity shrink-only ratchet)
5. `typecheck` (`tsc -b`)
6. `lint:py` when the repo has Python (`ruff`, `basedpyright`, `tach`, `vulture`)

`pnpm gate` = full Host gate (`tools/quality/js-ts/gate.sh full`: fast steps + osv-scanner + `pnpm test`; CI and pre-push). The gate runs every step even after a failure and ends with `# gate:… FAILED: …` listing step names. Acknowledge a vuln finding only with an `id` + `reason` in `osv-scanner.toml`.

**Never silence a diagnostic to get a pass:** no `biome-ignore` comments, no turning a rule off or down in `biome.json`, no baseline `--update` to absorb new findings. Fix the code. Baselines only shrink.

A task is not complete until `pnpm gate:fast` passes cleanly.
