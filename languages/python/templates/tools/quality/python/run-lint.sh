#!/usr/bin/env bash
# ruff check (lint).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "${REPO_ROOT}"

uvx ruff@0.17.2 check .
