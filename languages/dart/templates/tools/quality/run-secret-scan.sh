#!/usr/bin/env bash
# Betterleaks v1 secret scan — dart pack (mirrors js-ts run-secret-scan.ts).
# Usage: ./tools/quality/run-secret-scan.sh [--staged] [--verbose]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

BETTERLEAKS_MAJOR=1
REPO_ROOT="$(quality_repo_root)"
cd "${REPO_ROOT}"

is_staged=0
is_verbose=0
extra_args=()
for arg in "$@"; do
	case "${arg}" in
		--staged) is_staged=1 ;;
		--verbose) is_verbose=1 ;;
		--) ;;
		*) extra_args+=("${arg}") ;;
	esac
done

if ! quality_is_ci; then
	is_verbose=1
fi

version_major() {
	local out="$1"
	if [[ "${out}" =~ ^v?([0-9]+)\. ]]; then
		printf '%s\n' "${BASH_REMATCH[1]}"
	fi
}

try_bin() {
	local cmd="$1"
	local out
	if ! out="$("${cmd}" version 2>&1)"; then
		return 1
	fi
	printf '%s\n' "${out}"
}

resolve_bin() {
	local out major
	if out="$(try_bin betterleaks-v1)"; then
		major="$(version_major "${out}")"
		if [[ "${major}" == "${BETTERLEAKS_MAJOR}" ]]; then
			printf 'betterleaks-v1\n'
			return 0
		fi
	fi
	if out="$(try_bin betterleaks)"; then
		major="$(version_major "${out}")"
		if [[ "${major}" == "${BETTERLEAKS_MAJOR}" ]]; then
			printf 'betterleaks\n'
			return 0
		fi
		echo "error: found betterleaks ${out}, but quality-kit pins 1.x until v2 is stable." >&2
		echo "Install v1.9.0+ — see languages/dart/MODULE.md" >&2
		exit 2
	fi
	echo "error: betterleaks 1.x not found on PATH." >&2
	echo "  macOS: brew install --cask betterleaks/tap/betterleaks@1" >&2
	echo "  Linux: https://github.com/betterleaks/betterleaks/releases/tag/v1.9.0" >&2
	exit 2
}

bin="$(resolve_bin)"
args=()

if ((is_staged)); then
	args+=(git --staged)
elif quality_is_ci; then
	if git rev-parse --verify origin/main >/dev/null 2>&1; then
		args+=(git --log-opts=origin/main..HEAD)
	else
		args+=(git)
	fi
else
	args+=(dir .)
fi

args+=(--no-banner --redact)
if ((is_verbose)); then
	args+=(--verbose)
fi

if [[ -f "${REPO_ROOT}/.betterleaks.toml" ]]; then
	args+=(-c "${REPO_ROOT}/.betterleaks.toml")
fi
if [[ -f "${REPO_ROOT}/.betterleaksignore" ]]; then
	args+=(-i "${REPO_ROOT}/.betterleaksignore")
fi

args+=("${extra_args[@]+"${extra_args[@]}"}")

exec "${bin}" "${args[@]}"
