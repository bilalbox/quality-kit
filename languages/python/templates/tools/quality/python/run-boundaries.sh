#!/usr/bin/env bash
# tach module-boundary / cycle check.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "${REPO_ROOT}"

uvx tach@0.35.3 check
