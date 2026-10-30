#!/bin/sh
# Renders the cost card from docs/cost-card.html with headless Chrome.
#   docs/render-cost.sh          -> cost-light.png, cost-dark.png (Anthropic-like colors)
#   docs/render-cost.sh brand    -> cost-brand-light.png, cost-brand-dark.png (jack.direct colors, transparent corners)
# The PNGs live on the media branch, next to the tour GIFs.
set -e
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
palette="${1:-anthropic}"
prefix="cost"; [ "$palette" = brand ] && prefix="cost-brand"
for theme in light dark; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --default-background-color=00000000 --window-size=1000,480 \
    --screenshot="$PWD/$prefix-$theme.png" "file://$PWD/cost-card.html?theme=$theme&palette=$palette"
done
