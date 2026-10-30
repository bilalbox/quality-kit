#!/usr/bin/env bash
# quality-kit kotlin-android gate.
# Usage: ./tools/quality/gate.sh [fast|full]
#   fast — ktfmt + secrets + qualityFast (detekt, compile main + unit tests)
#   full — ktfmt + secrets + qualityFull (fast + lint, unit/screenshot tests,
#          Kover, buildHealth). Default for CI / pre-push.
# Every step runs even after a failure so one invocation reports everything.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

mode="${1:-full}"
case "${mode}" in
	fast) task=qualityFast ;;
	full) task=qualityFull ;;
	*)
		echo "usage: $0 [fast|full]" >&2
		exit 2
		;;
esac

REPO_ROOT="$(quality_repo_root)"
marker="$(mktemp)"
trap 'rm -f "${marker}"' EXIT

failed=()
step() {
	local name="$1"
	shift
	echo "==> ${name}"
	if ! "$@"; then
		failed+=("${name}")
	fi
}

echo "# gate:${mode}"
step format "${SCRIPT_DIR}/run-format.sh"
step secrets "${SCRIPT_DIR}/run-secret-scan.sh"
step gradle quality_gradle -q --continue "${task}"

if ((${#failed[@]} == 0)); then
	echo "# gate:${mode} ok"
	exit 0
fi

echo
echo "# gate:${mode} FAILED: ${failed[*]}"
mapfile -t diffs < <(
	find "${REPO_ROOT}" \( -name .git -o -name .gradle -o -name node_modules \) -prune -o \
		-path '*/build/outputs/roborazzi/*_compare.png' -newer "${marker}" -print 2>/dev/null | sort
)
changed=()
unrecorded=()
for compare in "${diffs[@]}"; do
	module="${compare%%/build/outputs/roborazzi/*}"
	name="${compare##*/}"
	if [[ -f "${module}/src/test/screenshots/${name%_compare.png}.png" ]]; then
		changed+=("${compare#"${REPO_ROOT}/"}")
	else
		unrecorded+=("${module#"${REPO_ROOT}/"}/src/test/screenshots/${name%_compare.png}.png")
	fi
done
if ((${#changed[@]} > 0)); then
	echo "Screenshot diffs (Reference | Diff | New) — open these images:"
	printf '  %s\n' "${changed[@]}"
	echo "If the change is intended: ./tools/quality/screenshots.sh record, then commit the goldens."
fi
if ((${#unrecorded[@]} > 0)); then
	echo "Previews without a golden — run ./tools/quality/screenshots.sh record, inspect, and commit:"
	printf '  %s\n' "${unrecorded[@]}"
fi
exit 1
