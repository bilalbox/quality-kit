#!/usr/bin/env bash
# Install the pinned Betterleaks release (Linux x64/arm64) into DEST.
# Usage: ./tools/quality/install-betterleaks.sh [DEST]   (default: ~/.local/bin)
set -euo pipefail

VERSION=1.9.0
dest="${1:-${HOME}/.local/bin}"

case "$(uname -m)" in
	x86_64 | amd64) asset="betterleaks_${VERSION}_linux_x64.tar.gz" ;;
	aarch64 | arm64) asset="betterleaks_${VERSION}_linux_arm64.tar.gz" ;;
	*)
		echo "error: no pinned Betterleaks build for $(uname -m)" >&2
		exit 2
		;;
esac

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

curl -fsSL -o "${work}/${asset}" \
	"https://github.com/betterleaks/betterleaks/releases/download/v${VERSION}/${asset}"
tar -xzf "${work}/${asset}" -C "${work}" betterleaks
mkdir -p "${dest}"
install -m 0755 "${work}/betterleaks" "${dest}/betterleaks"
"${dest}/betterleaks" version
