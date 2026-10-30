#!/usr/bin/env bash
# ktfmt (kotlinlang style) over tracked Kotlin sources.
# Usage: ./tools/quality/run-format.sh [--fix | --staged]
#   (none)   check only; exit 1 and list files that would change
#   --fix    format all files in place
#   --staged format staged files in place and re-stage (pre-commit)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

REPO_ROOT="$(quality_repo_root)"
cd "${REPO_ROOT}"

mode="${1:-check}"
case "${mode}" in
	check|--fix|--staged) ;;
	*)
		echo "usage: $0 [--fix|--staged]" >&2
		exit 2
		;;
esac

if [[ "${mode}" == "--staged" ]]; then
	mapfile -t files < <(git diff --cached --name-only --diff-filter=ACMR -- '*.kt' '*.kts')
else
	mapfile -t files < <(quality_kotlin_files)
fi

if ((${#files[@]} == 0)); then
	echo "format: no Kotlin files"
	exit 0
fi

ktfmt="$(quality_ktfmt_bin)"
# ktfmt reads an @argfile only when it is the sole argument, so flags go inside it.
argfile="$(mktemp)"
trap 'rm -f "${argfile}"' EXIT
flags=(--kotlinlang-style --quiet)
if [[ "${mode}" == "check" ]]; then
	flags+=(--dry-run --set-exit-if-changed)
fi
printf '%s\n' "${flags[@]}" "${files[@]}" >"${argfile}"

if ! "${ktfmt}" "@${argfile}"; then
	if [[ "${mode}" == "check" ]]; then
		echo "format: files above need ktfmt — run ./tools/quality/run-format.sh --fix" >&2
	fi
	exit 1
fi

if [[ "${mode}" == "--staged" ]]; then
	git add -- "${files[@]}"
fi
