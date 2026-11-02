#!/usr/bin/env bash
# pytest via the project environment.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "${REPO_ROOT}"

if [[ -f "uv.lock" ]] || [[ -f "pyproject.toml" ]]; then
	uv sync --frozen 2>/dev/null || uv sync
fi

uv run pytest
