#!/bin/sh
# Prints the body of one version's section of CHANGELOG.md: the release notes for that version.
#   docs/changelog-section.sh 1.2.0
# Fails when CHANGELOG.md has no section for it, so a release never goes out without notes.
set -e
version="$1"
[ -n "$version" ] || { echo "usage: $0 <version>" >&2; exit 2; }
notes=$(awk -v head="## $version " '
  index($0, head) == 1 { on = 1; next }
  on && /^## / { exit }
  on { print }
' "$(dirname "$0")/../CHANGELOG.md")
if [ -z "$(printf '%s' "$notes" | tr -d '[:space:]')" ]; then
  echo "CHANGELOG.md has no section for $version: add \"## $version (YYYY-MM-DD)\" with its notes." >&2
  exit 1
fi
# Without the blank lines around it.
printf '%s\n' "$notes" | awk 'NF { p = 1 } p' | awk '{ a[NR] = $0 } END { n = NR; while (n > 0 && a[n] ~ /^[[:space:]]*$/) n--; for (i = 1; i <= n; i++) print a[i] }'
