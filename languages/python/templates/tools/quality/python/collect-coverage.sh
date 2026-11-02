#!/usr/bin/env bash
# python coverage collector → findings JSON on stdout.
# Runs pytest under coverage.py (uv run --with) and emits one finding per
# src/<pkg> (or "." when there is no src layout). score = line coverage %.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

# Pin must match pins.json python.coverage / MODULE Pins.
COVERAGE_PIN="coverage==7.17.0"

if [[ -f "uv.lock" ]] || [[ -f "pyproject.toml" ]]; then
	uv sync --frozen 2>/dev/null || uv sync
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT
cov_data="${tmpdir}/.coverage"
cov_json="${tmpdir}/coverage.json"

omit='*/tests/*,*/test_*,*/.venv/*,*/venv/*,*/.uv/*,*/__pycache__/*'
source_args=()
if [[ -d src ]]; then
	source_args=(--source=src)
else
	source_args=(--source=.)
fi

# Fail the collector when tests fail (same contract as dart's collector).
uv run --with "${COVERAGE_PIN}" coverage run \
	"--data-file=${cov_data}" \
	"${source_args[@]}" \
	"--omit=${omit}" \
	-m pytest

uv run --with "${COVERAGE_PIN}" coverage json \
	"--data-file=${cov_data}" \
	-o "${cov_json}" >/dev/null

python3 - "${cov_json}" "${REPO_ROOT}" <<'PY'
import json, sys
from pathlib import Path

summary = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
root = Path(sys.argv[2]).resolve()
files = summary.get("files") or {}

packages: list[str] = []
src = root / "src"
if src.is_dir():
	for child in sorted(src.iterdir()):
		if child.is_dir() and (child / "__init__.py").is_file():
			packages.append(f"src/{child.name}")

def line_pct(entry: dict) -> float:
	s = entry.get("summary") or {}
	pct = s.get("percent_covered")
	if isinstance(pct, (int, float)):
		return round(float(pct), 2)
	covered = int(s.get("covered_lines") or 0)
	total = int(s.get("num_statements") or 0)
	if total <= 0:
		return 100.0
	return round(100.0 * covered / total, 2)

findings: list[dict] = []
if not packages:
	totals = summary.get("totals") or {}
	pct = totals.get("percent_covered")
	score = round(float(pct), 2) if isinstance(pct, (int, float)) else 0.0
	findings.append({"id": ".", "score": score})
else:
	for pkg in packages:
		covered = 0
		total = 0
		prefix = str((root / pkg).resolve())
		for path, entry in files.items():
			try:
				resolved = str(Path(path).resolve())
			except OSError:
				resolved = path
			if resolved == prefix or resolved.startswith(prefix + "/"):
				s = entry.get("summary") or {}
				total += int(s.get("num_statements") or 0)
				covered += int(s.get("covered_lines") or 0)
		score = round(100.0 * covered / total, 2) if total else 100.0
		findings.append({"id": pkg, "score": score})

print(json.dumps({"findings": findings}, indent="\t"))
PY
