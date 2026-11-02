#!/usr/bin/env bash
# ruff format.
# Usage: ./tools/quality/python/run-format.sh [--fix [files…] | --staged]
#   (none)   check; exit 1 if anything would change
#   --fix    format in place: the given files, else the whole tree
#   --staged check the staged content of staged .py files (pre-commit);
#            never writes the working tree or the index
set -euo pipefail

mode="${1:-check}"
case "${mode}" in
	check|--fix|--staged) ;;
	*)
		echo "usage: $0 [--fix [files...] | --staged]" >&2
		exit 2
		;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "${REPO_ROOT}"

if [[ "${mode}" == "--staged" ]]; then
	mapfile -d '' -t files < <(git diff --cached --name-only -z --diff-filter=ACMR -- '*.py')
	if ((${#files[@]} == 0)); then
		echo "format: no staged .py files"
		exit 0
	fi
	unformatted=()
	for f in "${files[@]}"; do
		# ruff format --check --stdin-filename reads the blob from stdin.
		if ! git show ":${f}" | uvx ruff@0.17.2 format --check --stdin-filename="${f}" - >/dev/null; then
			unformatted+=("${f}")
		fi
	done
	if ((${#unformatted[@]} > 0)); then
		echo "format: staged files need formatting:" >&2
		printf '  %s\n' "${unformatted[@]}" >&2
		echo "fix: ./tools/quality/python/run-format.sh --fix ${unformatted[*]} && git add ${unformatted[*]}" >&2
		exit 1
	fi
	exit 0
fi

if [[ "${mode}" == "--fix" ]]; then
	if (($# > 1)); then
		uvx ruff@0.17.2 format -- "${@:2}"
	else
		uvx ruff@0.17.2 format .
	fi
	exit 0
fi

if ! uvx ruff@0.17.2 format --check .; then
	echo "format: run ./tools/quality/python/run-format.sh --fix" >&2
	exit 1
fi
