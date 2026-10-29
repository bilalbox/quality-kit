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

# Load roots from config (non-empty array) or auto-detect.
quality_dart_roots() {
	local roots=()
	if [[ -f "${CONFIG_PATH}" ]] && command -v python3 >/dev/null 2>&1; then
		mapfile -t roots < <(python3 - <<'PY' "${CONFIG_PATH}"
import json, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    cfg = json.load(f)
roots = cfg.get("roots") or []
if isinstance(roots, list):
    for r in roots:
        if isinstance(r, str) and r.strip():
            print(r.strip())
PY
		)
	fi

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
	if [[ ! -f "${CONFIG_PATH}" ]] || ! command -v python3 >/dev/null 2>&1; then
		return 0
	fi
	python3 - <<'PY' "${CONFIG_PATH}"
import json, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    cfg = json.load(f)
env = cfg.get("flutterEnv") or ""
if isinstance(env, str) and env.strip():
    print(env.strip())
PY
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
