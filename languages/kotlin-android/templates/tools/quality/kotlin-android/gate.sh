#!/usr/bin/env bash
# quality-kit kotlin-android gate.
# Usage: ./tools/quality/kotlin-android/gate.sh [fast|full]
#   fast — ktfmt + secrets + qualityFast (detekt, compile main + unit tests)
#   full — ktfmt + secrets + qualityFull (fast + lint, unit/screenshot tests,
#          Kover, buildHealth). Default for CI / pre-push.
# Every step runs even after a failure so one invocation reports everything.
# Local multi-Host Targets use the composed ./tools/quality/gate.sh instead.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"
# Target layout: tools/quality/gate-lib.sh (shared layer). Kit path differs.
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../gate-lib.sh"

mode="${1:-full}"
case "${mode}" in
	fast) task=qualityFast ;;
	full) task=qualityFull ;;
	*)
		echo "usage: $0 [fast|full]" >&2
		exit 2
		;;
esac
quality_gate_begin

REPO_ROOT="$(quality_repo_root)"
marker="$(mktemp)"
trap 'rm -f "${marker}"' EXIT

echo "# gate:${mode}"
step format "${SCRIPT_DIR}/run-format.sh"
step secrets "${SCRIPT_DIR}/../run-secret-scan.sh"
if [[ "${mode}" == "full" ]]; then
	step vulns "${SCRIPT_DIR}/../run-vuln-scan.sh"
fi
step gradle quality_gradle -q --continue "${task}"
if [[ "${mode}" == "full" ]]; then
	# Kover XML from qualityFull; ratchet replaces the old minLineCoverage floor.
	step coverage "${SCRIPT_DIR}/../run-coverage-ratchet.sh"
fi

if quality_gate_succeeded; then
	echo "# gate:${mode} ok"
	exit 0
fi

quality_gate_print_failure
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
	echo "If the change is intended: ./tools/quality/kotlin-android/screenshots.sh record, then commit the goldens."
fi
if ((${#unrecorded[@]} > 0)); then
	echo "Previews without a golden — run ./tools/quality/kotlin-android/screenshots.sh record, inspect, and commit:"
	printf '  %s\n' "${unrecorded[@]}"
fi
exit 1
