#!/bin/bash

set -e

ICON_SOURCE="/home/vizion/Github/MediaMarks/icon.png"
ICON_DIR="$(dirname "$ICON_SOURCE")"
ICON_BASE="$ICON_DIR/icon"
ICO_OUTPUT="$ICON_DIR/icon.ico"

echo "🖼 Resizing images to standard icon sizes..."

# Generate intermediate PNGs
for size in 16 32 48 128; do
  ffmpeg -y -i "$ICON_SOURCE" -vf "scale=${size}:${size}" "$ICON_BASE-${size}x${size}.png"
done

echo "🧱 Combining resized PNGs into .ico file..."
ffmpeg -y -i "$ICON_BASE-16x16.png" \
       -i "$ICON_BASE-32x32.png" \
       -i "$ICON_BASE-32\\48x48.png" \
       -i "$ICON_BASE-128x128.png" \
       -filter_complex "[0:v][1:v][2:v]concat=n=3:v=1:a=0[out]" \
       -map "[out]" "$ICO_OUTPUT"

echo "🧹 Cleaning up intermediate PNG files..."
rm "$ICON_BASE"-*x*.png

echo "✅ Done! Created icon: $ICO_OUTPUT"
