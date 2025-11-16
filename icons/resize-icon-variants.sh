#!/bin/bash

set -e

# 🔧 Configuration
INPUT_ICON="/home/vizion/Github/MediaMarks/icons/imagea.png"
OUTPUT_DIR="/home/vizion/Github/MediaMarks/icons"

mkdir -p "$OUTPUT_DIR"

echo "🖼 Resizing icon to multiple standard sizes..."

for size in 16 32 48 128; do
  ffmpeg -y -i "$INPUT_ICON" -vf "scale=${size}:${size}" "$OUTPUT_DIR/${size}.png"
  echo "✅ Created: $OUTPUT_DIR/${size}.png"
done

echo "🏁 All icon sizes generated in: $OUTPUT_DIR"
