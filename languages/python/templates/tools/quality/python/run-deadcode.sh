#!/usr/bin/env bash
# vulture dead-code check (+ committed whitelist).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "${REPO_ROOT}"

uvx vulture@2.16 . vulture_whitelist.py
