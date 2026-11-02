#!/usr/bin/env bash
# Shared helpers for quality-kit dart gate scripts.
# shellcheck shell=bash

set -euo pipefail

QUALITY_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${QUALITY_LIB_DIR}/../.." && pwd)"
CONFIG_PATH="${REPO_ROOT}/quality-kit.dart.json"
DEPENDENCY_VALIDATOR_VERSION="${DEPENDENCY_VALIDATOR_VERSION:-5.1.0}"

quality_repo_root() {
	printf '%s\n' "${REPO_ROOT}"
}

quality_is_ci() {
	case "${CI:-}" in
		""|0|[Ff][Aa][Ll][Ss][Ee]) return 1 ;;
		*) return 0 ;;
	esac
}

quality_trim() {
	local s="$1"
	s="${s#"${s%%[![:space:]]*}"}"
	s="${s%"${s##*[![:space:]]}"}"
	printf '%s' "${s}"
}

# Config is read with bash regexes only (no python3/jq/node), so string values
# must not contain escaped quotes.
quality_config_roots() {
	[[ -f "${CONFIG_PATH}" ]] || return 0
	local cfg rest root
	cfg="$(<"${CONFIG_PATH}")"
	local roots_re='"roots"[[:space:]]*:[[:space:]]*\[([^]]*)\]'
	[[ "${cfg}" =~ ${roots_re} ]] || return 0
	rest="${BASH_REMATCH[1]}"
	local item_re='^[^"]*"([^"]*)"(.*)$'
	while [[ "${rest}" =~ ${item_re} ]]; do
		rest="${BASH_REMATCH[2]}"
		root="$(quality_trim "${BASH_REMATCH[1]}")"
		if [[ -n "${root}" ]]; then
			printf '%s\n' "${root}"
		fi
	done
}

# Load roots from config (non-empty array) or auto-detect.
quality_dart_roots() {
	local roots=()
	mapfile -t roots < <(quality_config_roots)

	if ((${#roots[@]} > 0)); then
		printf '%s\n' "${roots[@]}"
		return 0
	fi

	if [[ -f "${REPO_ROOT}/pubspec.yaml" ]]; then
		printf '.\n'
		return 0
	fi

	local found=()
	local d
	for d in "${REPO_ROOT}"/*; do
		[[ -d "${d}" ]] || continue
		local base
		base="$(basename "${d}")"
		case "${base}" in
			node_modules|.git|build|.dart_tool|dist) continue ;;
		esac
		if [[ -f "${d}/pubspec.yaml" ]]; then
			found+=("${base}")
		fi
	done
	if ((${#found[@]} > 0)); then
		printf '%s\n' "${found[@]}" | sort
		return 0
	fi

	local child
	for d in "${REPO_ROOT}"/*; do
		[[ -d "${d}" ]] || continue
		local base
		base="$(basename "${d}")"
		case "${base}" in
			node_modules|.git|build|.dart_tool|dist) continue ;;
		esac
		for child in "${d}"/*; do
			[[ -d "${child}" ]] || continue
			if [[ -f "${child}/pubspec.yaml" ]]; then
				found+=("${base}/$(basename "${child}")")
			fi
		done
	done
	if ((${#found[@]} > 0)); then
		printf '%s\n' "${found[@]}" | sort
		return 0
	fi

	echo "error: no Dart package roots found; set quality-kit.dart.json roots" >&2
	return 1
}

quality_flutter_env() {
	[[ -f "${CONFIG_PATH}" ]] || return 0
	local cfg env
	cfg="$(<"${CONFIG_PATH}")"
	local env_re='"flutterEnv"[[:space:]]*:[[:space:]]*"([^"]*)"'
	[[ "${cfg}" =~ ${env_re} ]] || return 0
	env="$(quality_trim "${BASH_REMATCH[1]}")"
	if [[ -n "${env}" ]]; then
		printf '%s\n' "${env}"
	fi
}

# Run a command, optionally wrapping with flutterEnv (like airlock tools/flutter-env.sh).
quality_run() {
	local env_rel
	env_rel="$(quality_flutter_env || true)"
	if [[ -n "${env_rel}" && -f "${REPO_ROOT}/${env_rel}" ]]; then
		# shellcheck disable=SC1090
		if [[ "${env_rel}" == *.sh ]]; then
			"${REPO_ROOT}/${env_rel}" "$@"
			return $?
		fi
	fi
	"$@"
}

quality_in_root() {
	local root="$1"
	shift
	local dir="${REPO_ROOT}"
	if [[ "${root}" != "." ]]; then
		dir="${REPO_ROOT}/${root}"
	fi
	(
		cd "${dir}"
		quality_run "$@"
	)
}

quality_has_flutter() {
	local root="$1"
	local pubspec="${REPO_ROOT}/pubspec.yaml"
	if [[ "${root}" != "." ]]; then
		pubspec="${REPO_ROOT}/${root}/pubspec.yaml"
	fi
	grep -qE '^[[:space:]]*flutter:' "${pubspec}" 2>/dev/null
}

quality_ensure_dependency_validator() {
	quality_run dart pub global activate dependency_validator "${DEPENDENCY_VALIDATOR_VERSION}" >/dev/null
	# Ensure pub-cache bin is on PATH for `dependency_validator` if present.
	local pub_bin="${PUB_CACHE:-${HOME}/.pub-cache}/bin"
	if [[ -d "${pub_bin}" && ":${PATH}:" != *":${pub_bin}:"* ]]; then
		export PATH="${pub_bin}:${PATH}"
	fi
}
