#!/usr/bin/env bash
# dart coverage collector → findings JSON on stdout.
# Per package root: flutter test --coverage (or dart test then skip if no lcov);
# score = line hit ratio from coverage/lcov.info.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

REPO_ROOT="$(quality_repo_root)"
tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT
findings_file="${tmpdir}/findings.json"
echo '{"findings":[]}' >"${findings_file}"

status=0
while IFS= read -r root; do
	echo "==> coverage [${root}]" >&2
	lcov=""
	if quality_has_flutter "${root}"; then
		if ! quality_in_root "${root}" flutter test --coverage >&2; then
			status=1
			continue
		fi
		lcov="${REPO_ROOT}/${root}/coverage/lcov.info"
		if [[ "${root}" == "." ]]; then
			lcov="${REPO_ROOT}/coverage/lcov.info"
		fi
	else
		# Pure dart: no built-in coverage flag as stable as Flutter's; run tests
		# and emit 100 only when there is no lib/ to cover, else require lcov via
		# `dart run coverage:test_with_coverage` when the Target adds it.
		if ! quality_in_root "${root}" dart test >&2; then
			status=1
			continue
		fi
		candidate="${REPO_ROOT}/${root}/coverage/lcov.info"
		[[ "${root}" == "." ]] && candidate="${REPO_ROOT}/coverage/lcov.info"
		if [[ -f "${candidate}" ]]; then
			lcov="${candidate}"
		else
			# No coverage artifact: treat as unscored module at 0 so the floor fails
			# loudly until the Target enables coverage collection.
			lcov=""
		fi
	fi

	id="${root}"
	[[ "${id}" == "." ]] || id="${root}"

	python3 - "${findings_file}" "${id}" "${lcov:-}" <<'PY'
import json, sys
from pathlib import Path

out_path, module_id, lcov = sys.argv[1], sys.argv[2], sys.argv[3]
data = json.loads(Path(out_path).read_text(encoding="utf-8"))

def lcov_line_pct(path: str) -> float:
    if not path:
        return 0.0
    p = Path(path)
    if not p.is_file():
        return 0.0
    lf = lh = 0
    for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("LF:"):
            lf += int(line[3:] or 0)
        elif line.startswith("LH:"):
            lh += int(line[3:] or 0)
    if lf <= 0:
        return 100.0 if lh == 0 else 0.0
    return round(100.0 * lh / lf, 2)

data["findings"].append({"id": module_id, "score": lcov_line_pct(lcov)})
Path(out_path).write_text(json.dumps(data, indent="\t") + "\n", encoding="utf-8")
PY
done < <(quality_dart_roots)

if [[ "${status}" -ne 0 ]]; then
	exit "${status}"
fi
cat "${findings_file}"
