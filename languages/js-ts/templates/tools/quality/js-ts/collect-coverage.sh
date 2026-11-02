#!/usr/bin/env bash
# js-ts coverage collector → findings JSON on stdout.
# Runs `pnpm test` under c8 and emits one finding per package (or "." for a
# single-package repo) with score = line coverage percent.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

if ! command -v pnpm >/dev/null 2>&1; then
	echo "error: pnpm is required for js-ts coverage collection" >&2
	exit 2
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT
report_dir="${tmpdir}/coverage"

# c8 wraps the Target's test script. JSON summary is per-file; we aggregate.
pnpm exec c8 \
	--reporter=json-summary \
	--reports-dir="${report_dir}" \
	--exclude='**/node_modules/**' \
	--exclude='**/dist/**' \
	--exclude='**/coverage/**' \
	--exclude='**/tests/**' \
	--exclude='**/*.test.*' \
	--exclude='**/*.spec.*' \
	pnpm test >/dev/null

summary="${report_dir}/coverage-summary.json"
if [[ ! -f "${summary}" ]]; then
	echo "error: c8 did not write ${summary}" >&2
	exit 1
fi

python3 - "${summary}" "${REPO_ROOT}" <<'PY'
import json, sys
from pathlib import Path

summary = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
root = Path(sys.argv[2]).resolve()

# Prefer workspace package dirs when present; else one "." total.
packages: list[str] = []
pkg_json = root / "package.json"
ws = root / "pnpm-workspace.yaml"
if ws.is_file():
    # Shallow package discovery: */package.json and packages/*/package.json
    for pattern in ("*/package.json", "packages/*/package.json", "apps/*/package.json"):
        for p in root.glob(pattern):
            rel = str(p.parent.relative_to(root)).replace("\\", "/")
            if rel not in (".",) and rel not in packages:
                packages.append(rel)
packages.sort()

def line_pct(entry: dict) -> float:
    lines = entry.get("lines") or {}
    pct = lines.get("pct")
    if isinstance(pct, (int, float)):
        return round(float(pct), 2)
    return 0.0

findings: list[dict] = []
if not packages:
    total = summary.get("total") or {}
    findings.append({"id": ".", "score": line_pct(total)})
else:
    # Aggregate file entries under each package prefix.
    files = {k: v for k, v in summary.items() if k != "total"}
    for pkg in packages:
        covered = 0
        total_lines = 0
        prefix = str((root / pkg).resolve())
        for path, entry in files.items():
            try:
                resolved = str(Path(path).resolve())
            except OSError:
                resolved = path
            if resolved == prefix or resolved.startswith(prefix + "/"):
                lines = entry.get("lines") or {}
                total_lines += int(lines.get("total") or 0)
                covered += int(lines.get("covered") or 0)
        pct = round((100.0 * covered / total_lines), 2) if total_lines else 0.0
        findings.append({"id": pkg, "score": pct})

print(json.dumps({"findings": findings}, indent="\t"))
PY
