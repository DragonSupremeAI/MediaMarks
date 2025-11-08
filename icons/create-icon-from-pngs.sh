#!/bin/bash

set -e

ICON_DIR="/home/vizion/Github/MediaMarks/icons"
OUT_PATH="/home/vizion/Github/MediaMarks/icon.ico"

echo "🧱 Building multi-resolution .ico file from PNGs..."

ffmpeg -y \
  -i "$ICON_DIR/16.png" \
  -i "$ICON_DIR/32.png" \
  -i "$ICON_DIR/128.png" \
  -map 0 -map 1 -map 2 \
  "$OUT_PATH"

echo "✅ ICO created at: $OUT_PATH"
