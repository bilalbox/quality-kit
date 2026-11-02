#!/usr/bin/env bash
# kotlin-android coverage collector → findings JSON on stdout.
# Parses Kover XML reports under each Android module after qualityFull / koverXmlReport.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

REPO_ROOT="$(quality_repo_root)"
cd "${REPO_ROOT}"

variant="$(
	python3 - <<'PY'
from pathlib import Path
variant = "debug"
for name in ("gradle.properties", "gradle.quality.properties"):
    p = Path(name)
    if not p.is_file():
        continue
    for line in p.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s.startswith("qualityKit.variant="):
            variant = s.split("=", 1)[1].strip() or variant
print(variant)
PY
)"
variant_task="$(python3 -c 'import sys; v=sys.argv[1]; print(v[:1].upper()+v[1:])' "${variant}")"

# Ensure XML reports exist (qualityFull already ran tests; this is a no-op when up to date).
quality_gradle -q "koverXmlReport${variant_task}" >&2 || true

python3 - "${REPO_ROOT}" "${variant}" <<'PY'
import json, re, sys
from pathlib import Path

root = Path(sys.argv[1])
variant = sys.argv[2]
findings: list[dict] = []

# Kover 0.9 default: <module>/build/reports/kover/report<Variant>.xml
pattern = f"report{variant[:1].upper() + variant[1:]}.xml"
for xml in sorted(root.glob(f"**/build/reports/kover/{pattern}")):
    # module id = path relative to root with /build/... stripped
    rel = xml.relative_to(root).as_posix()
    module = rel.split("/build/")[0]
    if module.startswith("build-logic"):
        continue
    text = xml.read_text(encoding="utf-8", errors="replace")
    score = 0.0
    try:
        import xml.etree.ElementTree as ET
        tree = ET.fromstring(text)
        line_counter = tree.find("./counter[@type='LINE']")
        if line_counter is None:
            counters = tree.findall(".//counter[@type='LINE']")
            if counters:
                line_counter = counters[-1]
        if line_counter is not None:
            missed = int(line_counter.attrib.get("missed", 0))
            covered = int(line_counter.attrib.get("covered", 0))
            total = missed + covered
            score = round(100.0 * covered / total, 2) if total else 100.0
    except Exception:
        pass
    findings.append({"id": module, "score": score})

print(json.dumps({"findings": findings}, indent="\t"))
PY
