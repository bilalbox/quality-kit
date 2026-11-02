#!/usr/bin/env bash
# dart format.
# Usage: ./tools/quality/run-format.sh [--fix [files…] | --staged]
#   (none)   check every package root; exit 1 if anything would change
#   --fix    format in place: the given repo-relative files, else every root
#   --staged check the staged content of staged .dart files (pre-commit);
#            never writes the working tree or the index
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

REPO_ROOT="$(quality_repo_root)"

mode="${1:-check}"
case "${mode}" in
	check|--fix|--staged) ;;
	*)
		echo "usage: $0 [--fix [files...] | --staged]" >&2
		exit 2
		;;
esac

if [[ "${mode}" == "--staged" ]]; then
	cd "${REPO_ROOT}"
	mapfile -d '' -t files < <(git diff --cached --name-only -z --diff-filter=ACMR -- '*.dart')
	if ((${#files[@]} == 0)); then
		echo "format: no staged .dart files"
		exit 0
	fi
	unformatted=()
	for f in "${files[@]}"; do
		if ! git show ":${f}" | quality_run dart format --output=none --show=none \
			--summary=none --set-exit-if-changed --stdin-name="${f}"; then
			unformatted+=("${f}")
		fi
	done
	if ((${#unformatted[@]} > 0)); then
		quality_staged_format_failure "${unformatted[@]}"
		exit 1
	fi
	exit 0
fi

if [[ "${mode}" == "--fix" ]] && (($# > 1)); then
	cd "${REPO_ROOT}"
	quality_run dart format -- "${@:2}"
	exit 0
fi

status=0
while IFS= read -r root; do
	echo "==> format [${root}]"
	if [[ "${mode}" == "--fix" ]]; then
		quality_in_root "${root}" dart format . || status=1
	elif ! quality_in_root "${root}" dart format --output=none --set-exit-if-changed .; then
		echo "format: run ./tools/quality/run-format.sh --fix" >&2
		status=1
	fi
done < <(quality_dart_roots)

exit "${status}"
