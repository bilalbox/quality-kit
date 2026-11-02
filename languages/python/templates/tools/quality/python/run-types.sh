#!/usr/bin/env bash
# basedpyright against the project environment so third-party imports resolve.
# Uses `uv run --with` so the type checker sees the Target's installed deps
# (unlike bare `uvx basedpyright`, which is isolated from the project venv).
# Pin form is `basedpyright==…` (uv treats `@` as a path).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "${REPO_ROOT}"

if [[ -f "uv.lock" ]] || [[ -f "pyproject.toml" ]]; then
	uv sync --frozen 2>/dev/null || uv sync
fi

uv run --with basedpyright==1.40.2 basedpyright
