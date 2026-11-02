#!/usr/bin/env bash
# quality-kit python gate.
# Usage: ./tools/quality/python/gate.sh [fast|full]
#   fast — format + lint + types + boundaries + deadcode + secrets
#   full — fast + osv-scanner + pytest (default for CI / pre-push)
# Every step runs even after a failure so one invocation reports everything
# (same run-all contract as other Hosts; see REFERENCE.md / #15).
# Local multi-Host Targets use the composed ./tools/quality/gate.sh instead.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mode="${1:-full}"

case "${mode}" in
	fast|full) ;;
	*)
		echo "usage: $0 [fast|full]" >&2
		exit 2
		;;
esac

failed=()
step() {
	local name="$1"
	shift
	echo "==> ${name}"
	if ! "$@"; then
		failed+=("${name}")
	fi
}

echo "# gate:${mode}"
step format "${SCRIPT_DIR}/run-format.sh"
step lint "${SCRIPT_DIR}/run-lint.sh"
step types "${SCRIPT_DIR}/run-types.sh"
step boundaries "${SCRIPT_DIR}/run-boundaries.sh"
step deadcode "${SCRIPT_DIR}/run-deadcode.sh"
step secrets "${SCRIPT_DIR}/../run-secret-scan.sh"

if [[ "${mode}" == "full" ]]; then
	step vulns "${SCRIPT_DIR}/../run-vuln-scan.sh"
	# Coverage ratchet (#21): plug a collector here once the shared layer lands.
	step test "${SCRIPT_DIR}/run-test.sh"
fi

if ((${#failed[@]} == 0)); then
	echo "# gate:${mode} ok"
	exit 0
fi

echo
echo "# gate:${mode} FAILED: ${failed[*]}"
exit 1
