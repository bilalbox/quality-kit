# Pack: python

Detect (product signal): root `pyproject.toml`, or any `.py` within depth 4 **outside** helper dirs (`tool`, `tools`, `scripts`, `script`, `bin`). Force with `--packs …,python` or `--python`. Templates: `languages/python/templates/`.

Incidental helper scripts (e.g. Flutter `tool/*.py`) do **not** auto-select this pack.

Fragment Pack onto a `js-ts` Host: contributes `package.scripts.json` (`lint:py`, `gate:fast:py`) and appends `lint:py` onto Desired-state `gate:fast`. Without that Host, file templates can still apply but gate scripts are not wired (audit warns).

## Tools

| Concern | Tool | Notes |
| --- | --- | --- |
| Lint/format | **ruff** via `uvx` | Biome analogue. |
| Types | **basedpyright** (`standard`) | `tsc` analogue. |
| Boundaries/cycles | **tach** | Always on when this pack is selected. |
| Dead code | **vulture** + whitelist | Knip analogue. |

## Pins

`ruff@0.17.2`, `basedpyright@1.40.2`, `tach@0.35.3`, `vulture@2.16`.

- `tach.toml`: run `uvx tach@0.35.3 init` then refine `[[modules]]`. Keep `forbid_circular_dependencies = true`.
- Vulture: commit `vulture_whitelist.py` from `--make-whitelist`; treat like a baseline.

## Post-apply

1. Refine `tach.toml` modules.
2. `uvx vulture@2.16 --make-whitelist` and commit the whitelist.
