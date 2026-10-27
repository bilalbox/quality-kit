# Pack: python

Detect: any `.py` within depth 4. Force with `--packs …,python` or `--python`. Templates: `languages/python/templates/`.

Composes onto a `js-ts` host: adds `lint:py` and appends it to `gate:fast`.

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
