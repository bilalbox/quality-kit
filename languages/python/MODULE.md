# Pack: python

Detect (product signal): root `pyproject.toml`, or any `.py` within depth 4 **outside** helper dirs (`tool`, `tools`, `scripts`, `script`, `bin`). Force with `--packs …,python` or `--python`. Templates: `languages/python/templates/`.

Incidental helper scripts (e.g. Flutter `tool/*.py`) do **not** auto-select this pack.

## Host vs Fragment

- **Host** (no `js-ts` in the selection): standalone gate like dart / kotlin-android — uv-based env, namespaced scripts under `tools/quality/python/`, lefthook, composed top-level `tools/quality/gate.sh`, CI (`setup-uv` + `python-quality-gate`), Shared layer (secrets + osv-scanner). Multi-Host Targets share composed root files (see REFERENCE.md "Local gate + hooks composition").
- **Fragment** (onto a `js-ts` Host): contributes `package.scripts.json` (`lint:py`, `gate:fast:py`) and appends `lint:py` onto Desired-state `gate:fast` once. No Host scripts / lefthook / CI job from this Pack.

## Tools

| Concern | Tool | Notes |
| --- | --- | --- |
| Lint/format | **ruff** via `uvx` | Biome analogue. |
| Types | **basedpyright** (`standard`) | Host: `uv run --with basedpyright==…` against the project env so imports resolve. Fragment: `uvx basedpyright@…`. |
| Boundaries/cycles | **tach** | Always on when this pack is selected. |
| Dead code | **vulture** + whitelist | Knip analogue. |
| Tests | **pytest** (Host) | Via `uv run pytest` (`make test` / collector); add pytest as a Target dev dependency. |
| Coverage | **coverage.py + shared ratchet** | Host full gate; `tools/quality/python/collect-coverage.sh` → `baselines/coverage.json`. |
| Secrets | **Betterleaks v1** | Shared layer (Host mode). |
| Dependency vulns | **osv-scanner** | Shared layer; Host `gate.sh full` only. |
| Hooks | **lefthook** (Host) | pre-commit: secrets + format check of staged content; pre-push: full gate. |
| Orchestration | **`tools/quality/python/gate.sh`** | `fast` = format + lint + types + boundaries + deadcode + secrets; `full` = fast + vulns + coverage ratchet. Run-all + summary (same contract as other Hosts). |

## Pre-commit format

`run-format.sh --staged` checks staged `.py` blobs only (never rewrites or re-stages). A misformatted staged file fails with:

```text
fix: ./tools/quality/python/run-format.sh --fix <files> && git add <files>
```

## Secrets (Betterleaks)

Config, wrapper, install and CI step come from the Shared layer: see [languages/shared/MODULE.md](../shared/MODULE.md). lefthook pre-commit runs it with `--staged`; `gate.sh fast` and `make secrets` scan the working tree.

**Pack allowlist** (`.betterleaks.d/python.toml`): `.venv/`, `venv/`, `.uv/`, `.pytest_cache/`, `.ruff_cache/`, `.mypy_cache/`, `__pycache__/`.

## Dependency vulns (osv-scanner)

Wrapper, install and CI step come from the Shared layer. `gate.sh full` and `make vulns` run `tools/quality/run-vuln-scan.sh` (covers `uv.lock`).

## CI

- Gate action: `.github/actions/python-quality-gate/` (namespaced for multi-Host Targets).
- Setup: `.github/actions/setup-uv/` (`astral-sh/setup-uv` + `uv sync`).
- Workflow template `templates/.github/workflows/ci.yml` is a composition input; Desired state places a generated `.github/workflows/ci.yml` (see REFERENCE.md "CI composition").

## Placement kinds

Everything not listed is **owned** (audit reports drift). Shared-layer files: see [languages/shared/MODULE.md](../shared/MODULE.md).

- **seed:** `tach.toml`, `vulture_whitelist.py`
- **merge-into:** `pyproject.toml` → itself (`[tool.ruff]`, `[tool.basedpyright]`, `[tool.vulture]` tables); Host: composed `AGENTS.quality.md` → `AGENTS.md`; composed `Makefile` → itself (`gate-fast:` and `gate:`)
- **generated (owned, Host):** Target `.github/workflows/ci.yml`, top-level `tools/quality/gate.sh`, `lefthook.yml`, `.editorconfig`

## Wiring probes

Host mode only (see REFERENCE.md "Wiring probes"):

- **git hooks installed (lefthook)**: `pre-commit` and `pre-push` installed by `lefthook install`.

## Post-apply

`apply` prints this list as its "Next" output, so it is the only copy of these steps. Keep each step on one line.

1. Merge kit `[tool.ruff]` / `[tool.basedpyright]` / `[tool.vulture]` tables into root `pyproject.toml` (self-merge).
2. Refine `tach.toml` modules (replace the placeholder path).
3. `uvx vulture@2.16 --make-whitelist` and commit the whitelist (or keep the seed empty whitelist and grow it).
4. Host: install Betterleaks v1.9.0+ and osv-scanner (see languages/shared/MODULE.md) and lefthook; run `lefthook install`. Fragment (js-ts): rely on the Host's hooks; `pnpm gate:fast` already runs `lint:py`.
5. Host: if `Makefile` already existed, add `gate` / `gate-fast` targets that call `./tools/quality/gate.sh`.
6. Host: merge `AGENTS.quality.md` into `AGENTS.md`.
7. Host: `uv add --dev pytest` (and any other test deps), then `./tools/quality/gate.sh full` (coverage ratchet runs pytest under coverage.py). Fragment: `pnpm lint:py`.
8. Host: after the first green full gate, run `./tools/quality/run-coverage-ratchet.sh --update` and commit `baselines/coverage.json` (keep `floor` at 80 unless legacy-adopting).

## Pins

Source: kit-root `pins.json` (see REFERENCE.md "Pins"). Literals below and in `package.scripts.json` / Host `run-*.sh` must match.

`ruff@0.17.2`, `basedpyright@1.40.2`, `tach@0.35.3`, `vulture@2.16`, `coverage@7.17.0`.

- `tach.toml`: run `uvx tach@0.35.3 init` then refine `[[modules]]`. Keep `forbid_circular_dependencies = true`.
- Vulture: commit `vulture_whitelist.py` from `--make-whitelist`; treat like a baseline.
