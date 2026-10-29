#!/usr/bin/env bash
# flutter/dart test per package root.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

status=0
while IFS= read -r root; do
	echo "==> test [${root}]"
	if quality_has_flutter "${root}"; then
		if ! quality_in_root "${root}" flutter test; then
			status=1
		fi
	else
		if ! quality_in_root "${root}" dart test; then
			status=1
		fi
	fi
done < <(quality_dart_roots)

exit "${status}"
