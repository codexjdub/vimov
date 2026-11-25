#!/bin/sh
# Takes the store screenshots, store/screenshots/*.png at 1280×800, of
# dev/demo.html with headless Chrome, in light mode.
#
# Serve the repo first (node dev/serve.mjs), then: sh dev/screenshots.sh
# CHROME=/path/to/chrome and PORT=8765 override the defaults.
set -eu
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PORT:-8765}"
URL="http://127.0.0.1:$PORT/dev/demo.html"

if ! curl -sf -o /dev/null "$URL"; then
  echo "Nothing at $URL. Start the server first: node dev/serve.mjs $PORT" >&2
  exit 1
fi

# A fresh profile each time, so nothing from your own Chrome shows.
PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE"' EXIT

mkdir -p store/screenshots
n=1
for shot in hints vbar help find next; do
  out="store/screenshots/$n-$shot.png"
  "$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
    --disable-background-networking --disable-component-update --disable-sync \
    --user-data-dir="$PROFILE" --window-size=1280,800 --force-device-scale-factor=1 \
    --hide-scrollbars --blink-settings=preferredColorScheme=1 --virtual-time-budget=5000 \
    --screenshot="$out" "$URL?harness&shot=$shot" >/dev/null 2>&1
  echo "$out"
  n=$((n + 1))
done
