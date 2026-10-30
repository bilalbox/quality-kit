#!/usr/bin/env bash
# Read-only environment check for headless Android work (agents, CI, containers).
# Prints the fix command for each problem; exits 1 if any required check fails.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

REPO_ROOT="$(quality_repo_root)"
cd "${REPO_ROOT}"
problems=0

ok() { echo "ok    $*"; }
warn() { echo "warn  $*"; }
bad() {
	echo "FAIL  $*"
	problems=$((problems + 1))
}

if command -v java >/dev/null 2>&1; then
	major="$(java -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1)"
	if ((${major:-0} >= 17)); then ok "java ${major}"; else bad "java ${major:-?} (need 17+; 21 recommended)"; fi
else
	bad "java not on PATH (install a JDK 21)"
fi

sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "${sdk}" && -f local.properties ]]; then
	sdk="$(sed -n 's/^sdk\.dir=\(.*\)$/\1/p' local.properties | tail -1)"
fi
if [[ -n "${sdk}" && -d "${sdk}" ]]; then
	ok "android sdk ${sdk}"
	if [[ -d "${sdk}/licenses" ]]; then
		ok "sdk licenses"
	else
		bad "sdk licenses not accepted: yes | sdkmanager --licenses"
	fi
	mapfile -t sdks < <(
		git ls-files -- '*.gradle.kts' '*.gradle' 'gradle/libs.versions.toml' \
			| xargs -r sed -n 's/.*compileSdk[A-Za-z]* *=* *"\{0,1\}\([0-9][0-9]*\).*/\1/p' | sort -u
	)
	for level in "${sdks[@]}"; do
		if [[ -d "${sdk}/platforms/android-${level}" ]]; then
			ok "platform android-${level}"
		else
			bad "platform android-${level} missing: sdkmanager \"platforms;android-${level}\""
		fi
	done
else
	bad "android sdk not found: set ANDROID_HOME or sdk.dir in local.properties"
fi

if [[ ":${LD_LIBRARY_PATH:-}:" == *"/emulator/"* ]]; then
	warn "LD_LIBRARY_PATH contains emulator libs (quality-kit.android strips them for tests; other JVM tools may break)"
fi

[[ -x ./gradlew ]] && ok "gradle wrapper" || bad "gradlew missing or not executable"
grep -q 'build-logic/quality' settings.gradle* 2>/dev/null \
	&& ok "settings includes build-logic/quality" \
	|| bad "settings.gradle.kts: add includeBuild(\"build-logic/quality\") to pluginManagement"
grep -q 'quality-kit.root' build.gradle* 2>/dev/null \
	&& ok "root applies quality-kit.root" \
	|| bad "root build.gradle.kts: add id(\"quality-kit.root\") to plugins"

if command -v betterleaks >/dev/null 2>&1 || command -v betterleaks-v1 >/dev/null 2>&1; then
	ok "betterleaks"
else
	bad "betterleaks 1.x not on PATH (see languages/kotlin-android/MODULE.md)"
fi
command -v lefthook >/dev/null 2>&1 && ok "lefthook" || warn "lefthook not on PATH (hooks inactive)"
if ktfmt_bin="$(quality_ktfmt_bin 2>/dev/null)"; then ok "ktfmt ${KTFMT_VERSION} (${ktfmt_bin})"; else bad "ktfmt download failed"; fi

if ((problems > 0)); then
	echo "# doctor: ${problems} problem(s)"
	exit 1
fi
echo "# doctor: ok"
