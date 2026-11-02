## Definition of Done (Mandatory Gate)

Before considering any code change or task done (even when not pushing), **always run `./tools/quality/gate.sh fast` first** (or `make gate-fast` when wired).

Do not declare completion with only piecemeal checks (`ruff` alone, format alone, or a single test file). `gate.sh fast` bundles:

1. `ruff format --check` — fix with `./tools/quality/python/run-format.sh --fix`
2. `ruff check`
3. `basedpyright` (against the project environment so imports resolve)
4. `tach check` (module boundaries / cycles)
5. `vulture` (+ committed whitelist)
6. Betterleaks secret scan

`./tools/quality/gate.sh full` = fast + osv-scanner (lockfile vulns) + coverage ratchet (`pytest` under coverage.py vs `baselines/coverage.json`; CI and pre-push). Acknowledge a finding only with an `id` + `reason` in `osv-scanner.toml`.

A task is not complete until `gate.sh fast` passes cleanly.
