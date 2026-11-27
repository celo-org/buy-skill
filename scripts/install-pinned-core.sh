#!/usr/bin/env bash
# Installs the @celo/buy-core version the skill pins, read out of the skill so
# bumping the pin cannot leave a check on the old package.
set -euo pipefail
# Every place this repository shows a pinned command. They must agree: a sync
# that moved the skill and the README once left the issue templates on the old
# release, and nothing noticed.
pinned=(skills/order-compute/SKILL.md README.md .github/ISSUE_TEMPLATE)
version="$(grep -rohE '@celo/buy@[A-Za-z0-9._-]+' "${pinned[@]}" \
           | sed 's/.*@//' | sort -u)"
if [ "$(printf '%s\n' "$version" | wc -l)" -ne 1 ] || [ -z "$version" ]; then
  echo "::error::${pinned[*]} must pin exactly one @celo/buy version; found: $(printf '%s ' $version)"
  exit 1
fi
echo "skill pins @celo/buy@$version"
# Any package named as an argument (for example @celo/buy-registry) is
# installed at the same version, so the checks read with one release.
packages=("@celo/buy-core@$version")
for name in "$@"; do
  packages+=("$name@$version")
done
npm install --no-save --no-package-lock --ignore-scripts "${packages[@]}"
