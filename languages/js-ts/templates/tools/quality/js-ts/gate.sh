#!/usr/bin/env bash
# quality-kit js-ts gate.
# Usage: ./tools/quality/js-ts/gate.sh [fast|full] [extra-pnpm-script…]
#   fast — lint + secrets + graph + complexity + typecheck (+ Fragment scripts)
#   full — fast + vulns + test (default for CI / pre-push)
# Every step runs even after a failure so one invocation reports everything.
# Fragment Packs append their pnpm script names as extra args (via Desired state).
# Local multi-Host Targets use the composed ./tools/quality/gate.sh instead.
set -euo pipefail

mode="${1:-full}"
if (($# > 0)); then
	shift
fi
extras=("$@")

case "${mode}" in
	fast|full) ;;
	*)
		echo "usage: $0 [fast|full] [extra-pnpm-script…]" >&2
		exit 2
		;;
esac

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
step lint pnpm lint
step secrets pnpm lint:secrets
step graph pnpm lint:graph
step complexity pnpm lint:complexity
step typecheck pnpm typecheck
for frag in "${extras[@]}"; do
	step "${frag}" pnpm "${frag}"
done

if [[ "${mode}" == "full" ]]; then
	step vulns pnpm lint:vulns
	step test pnpm test
fi

if ((${#failed[@]} == 0)); then
	echo "# gate:${mode} ok"
	exit 0
fi

echo
echo "# gate:${mode} FAILED: ${failed[*]}"
exit 1
