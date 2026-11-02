#!/usr/bin/env bash
# quality-kit dart gate.
# Usage: ./tools/quality/dart/gate.sh [fast|full]
#   fast — format + analyze + secrets + deps
#   full — fast + vulns + coverage ratchet (default for CI / pre-push)
# Every step runs even after a failure so one invocation reports everything.
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
step analyze "${SCRIPT_DIR}/run-analyze.sh"
step secrets "${SCRIPT_DIR}/../run-secret-scan.sh"
step deps "${SCRIPT_DIR}/run-deps.sh"

if [[ "${mode}" == "full" ]]; then
	step vulns "${SCRIPT_DIR}/../run-vuln-scan.sh"
	# Collector runs flutter test --coverage; replaces bare run-test.sh.
	step coverage "${SCRIPT_DIR}/../run-coverage-ratchet.sh"
fi

quality_gate_finish
