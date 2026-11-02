#!/usr/bin/env bash
# quality-kit dart gate.
# Usage: ./tools/quality/dart/gate.sh [fast|full]
#   fast — format + analyze + secrets + deps
#   full — fast + vulns + test (default for CI / pre-push)
# Every step runs even after a failure so one invocation reports everything.
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
step analyze "${SCRIPT_DIR}/run-analyze.sh"
step secrets "${SCRIPT_DIR}/../run-secret-scan.sh"
step deps "${SCRIPT_DIR}/run-deps.sh"

if [[ "${mode}" == "full" ]]; then
	step vulns "${SCRIPT_DIR}/../run-vuln-scan.sh"
	step test "${SCRIPT_DIR}/run-test.sh"
fi

if ((${#failed[@]} == 0)); then
	echo "# gate:${mode} ok"
	exit 0
fi

echo
echo "# gate:${mode} FAILED: ${failed[*]}"
exit 1
