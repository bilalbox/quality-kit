#!/usr/bin/env bash
# dependency_validator per package root (pin via DEPENDENCY_VALIDATOR_VERSION).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

quality_ensure_dependency_validator

status=0
while IFS= read -r root; do
	echo "==> deps [${root}] (dependency_validator@${DEPENDENCY_VALIDATOR_VERSION})"
	if ! quality_in_root "${root}" dart pub global run dependency_validator; then
		status=1
	fi
done < <(quality_dart_roots)

exit "${status}"
