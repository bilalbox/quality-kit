#!/usr/bin/env bash
# quality-kit dart gate.
# Usage: ./tools/quality/gate.sh [fast|full]
#   fast — format + analyze + secrets + deps
#   full — fast + test (default for CI / pre-push)
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

echo "# gate:${mode}"
"${SCRIPT_DIR}/run-format.sh"
"${SCRIPT_DIR}/run-analyze.sh"
"${SCRIPT_DIR}/run-secret-scan.sh"
"${SCRIPT_DIR}/run-deps.sh"

if [[ "${mode}" == "full" ]]; then
	"${SCRIPT_DIR}/run-test.sh"
fi

echo "# gate:${mode} ok"
