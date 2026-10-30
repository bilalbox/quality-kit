#!/usr/bin/env bash
# Shared helpers for quality-kit kotlin-android gate scripts.
# shellcheck shell=bash

set -euo pipefail

QUALITY_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${QUALITY_LIB_DIR}/../.." && pwd)"
KTFMT_VERSION="${KTFMT_VERSION:-0.65}"
KTFMT_RELEASES="https://github.com/Kotlin/ktfmt/releases/download/v${KTFMT_VERSION}"

quality_repo_root() {
	printf '%s\n' "${REPO_ROOT}"
}

quality_is_ci() {
	case "${CI:-}" in
		""|0|[Ff][Aa][Ll][Ss][Ee]) return 1 ;;
		*) return 0 ;;
	esac
}

# Variant used by qualityFast/qualityFull (root gradle.properties `qualityKit.variant`).
quality_variant() {
	local v=""
	if [[ -f "${REPO_ROOT}/gradle.properties" ]]; then
		v="$(sed -n 's/^qualityKit\.variant=\(.*\)$/\1/p' "${REPO_ROOT}/gradle.properties" | tail -1)"
	fi
	printf '%s\n' "${v:-debug}"
}

quality_variant_task() {
	local v
	v="$(quality_variant)"
	printf '%s%s\n' "$(printf '%s' "${v:0:1}" | tr '[:lower:]' '[:upper:]')" "${v:1}"
}

quality_gradle() {
	(cd "${REPO_ROOT}" && ./gradlew --console=plain "$@")
}

# Tracked + untracked (not ignored) Kotlin sources, NUL-free one per line.
quality_kotlin_files() {
	git -C "${REPO_ROOT}" ls-files -co --exclude-standard -- '*.kt' '*.kts'
}

quality_cache_dir() {
	printf '%s\n' "${XDG_CACHE_HOME:-${HOME}/.cache}/quality-kit"
}

# Print a path to a ktfmt executable at KTFMT_VERSION, downloading on first use.
# Prefers ktfmt on PATH, then the native release binary, then the JVM jar.
quality_ktfmt_bin() {
	if command -v ktfmt >/dev/null 2>&1 \
		&& [[ "$(ktfmt --version 2>/dev/null)" == "ktfmt version ${KTFMT_VERSION}" ]]; then
		command -v ktfmt
		return 0
	fi

	local dir asset=""
	dir="$(quality_cache_dir)/ktfmt-${KTFMT_VERSION}"
	case "$(uname -s)-$(uname -m)" in
		Linux-x86_64) asset="ktfmt-linux-x86_64-${KTFMT_VERSION}" ;;
		Darwin-arm64) asset="ktfmt-macos-aarch64-${KTFMT_VERSION}" ;;
	esac

	if [[ -n "${asset}" ]]; then
		local bin="${dir}/${asset}/ktfmt"
		if [[ ! -x "${bin}" ]]; then
			mkdir -p "${dir}"
			local tgz="${dir}/${asset}.tar.gz"
			echo "ktfmt: downloading ${asset}" >&2
			curl -fsSL -o "${tgz}" "${KTFMT_RELEASES}/${asset}.tar.gz"
			local want got
			want="$(curl -fsSL "${KTFMT_RELEASES}/${asset}.tar.gz.sha256" | cut -d' ' -f1)"
			got="$(sha256sum "${tgz}" 2>/dev/null || shasum -a 256 "${tgz}")"
			if [[ "${got%% *}" != "${want}" ]]; then
				rm -f "${tgz}"
				echo "error: ktfmt checksum mismatch for ${asset}" >&2
				return 2
			fi
			tar -xzf "${tgz}" -C "${dir}"
			rm -f "${tgz}"
		fi
		printf '%s\n' "${bin}"
		return 0
	fi

	local jar="${dir}/ktfmt-${KTFMT_VERSION}-with-dependencies.jar"
	local wrapper="${dir}/ktfmt"
	if [[ ! -f "${jar}" ]]; then
		mkdir -p "${dir}"
		echo "ktfmt: downloading ${jar##*/}" >&2
		curl -fsSL -o "${jar}" "${KTFMT_RELEASES}/${jar##*/}"
	fi
	if [[ ! -x "${wrapper}" ]]; then
		printf '#!/usr/bin/env bash\nexec java -jar "%s" "$@"\n' "${jar}" >"${wrapper}"
		chmod +x "${wrapper}"
	fi
	printf '%s\n' "${wrapper}"
}
