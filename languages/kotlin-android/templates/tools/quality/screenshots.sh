#!/usr/bin/env bash
# Roborazzi screenshot workflow (JVM-only via Robolectric; no emulator).
# Usage: ./tools/quality/screenshots.sh record|compare|verify [extra gradle args]
#   record  — rewrite goldens under */src/test/screenshots (prunes stale ones)
#   compare — write *_compare.png diffs without failing
#   verify  — fail on any diff (what the full gate runs)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

REPO_ROOT="$(quality_repo_root)"
action="${1:-}"
shift || true
v="$(quality_variant_task)"

case "${action}" in
	record)
		quality_gradle -q "recordRoborazzi${v}" -Proborazzi.cleanupOldScreenshots=true "$@"
		echo "Golden changes:"
		git -C "${REPO_ROOT}" status --short -- ':(glob)**/src/test/screenshots/**'
		;;
	compare)
		quality_gradle -q --continue "compareRoborazzi${v}" "$@" || true
		find "${REPO_ROOT}" \( -name .git -o -name .gradle \) -prune -o \
			-path '*/build/outputs/roborazzi/*_compare.png' -print | sort
		;;
	verify)
		quality_gradle -q --continue "verifyRoborazzi${v}" "$@"
		;;
	*)
		echo "usage: $0 record|compare|verify [gradle args]" >&2
		exit 2
		;;
esac
