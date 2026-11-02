#!/usr/bin/env bash
# quality-kit python gate.
# Usage: ./tools/quality/python/gate.sh [fast|full]
#   fast — format + lint + types + boundaries + deadcode + secrets
#   full — fast + osv-scanner + coverage ratchet (default for CI / pre-push)
# Every step runs even after a failure so one invocation reports everything
# (same run-all contract as other Hosts; see REFERENCE.md / #15).
# Local multi-Host Targets use the composed ./tools/quality/gate.sh instead.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Target layout: tools/quality/gate-lib.sh (shared layer). Kit path differs.
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../gate-lib.sh"

mode="${1:-full}"
quality_gate_require_mode

echo "# gate:${mode}"
step format "${SCRIPT_DIR}/run-format.sh"
step lint "${SCRIPT_DIR}/run-lint.sh"
step types "${SCRIPT_DIR}/run-types.sh"
step boundaries "${SCRIPT_DIR}/run-boundaries.sh"
step deadcode "${SCRIPT_DIR}/run-deadcode.sh"
step secrets "${SCRIPT_DIR}/../run-secret-scan.sh"

if [[ "${mode}" == "full" ]]; then
	step vulns "${SCRIPT_DIR}/../run-vuln-scan.sh"
	# Collector runs pytest under coverage.py; replaces bare run-test.sh.
	step coverage "${SCRIPT_DIR}/../run-coverage-ratchet.sh"
fi

quality_gate_finish
