#!/usr/bin/env bash
# Installs the @celo/buy-core version the skill pins, read out of the skill so
# bumping the pin cannot leave a check on the old package.
set -euo pipefail
version="$(grep -ohE '@celo/buy@[A-Za-z0-9._-]+' skills/order-compute/SKILL.md \
           | sed 's/.*@//' | sort -u)"
if [ "$(printf '%s\n' "$version" | wc -l)" -ne 1 ] || [ -z "$version" ]; then
  echo "::error::the skill must pin exactly one @celo/buy version; found: $version"
  exit 1
fi
echo "skill pins @celo/buy@$version"
npm install --no-save --no-package-lock --ignore-scripts "@celo/buy-core@$version"
