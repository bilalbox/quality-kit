#!/usr/bin/env bash
# dart format — all roots, or --staged files only.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

REPO_ROOT="$(quality_repo_root)"

if [[ "${1:-}" == "--staged" ]]; then
	mapfile -t files < <(git -C "${REPO_ROOT}" diff --cached --name-only --diff-filter=ACMR | grep '\.dart$' || true)
	if ((${#files[@]} == 0)); then
		echo "format: no staged .dart files"
		exit 0
	fi
	cd "${REPO_ROOT}"
	# Format in place for the hook, then re-stage.
	quality_run dart format "${files[@]}"
	git add -- "${files[@]}"
	exit 0
fi

status=0
while IFS= read -r root; do
	echo "==> format [${root}]"
	if ! quality_in_root "${root}" dart format --output=none --set-exit-if-changed .; then
		status=1
	fi
done < <(quality_dart_roots)

exit "${status}"
