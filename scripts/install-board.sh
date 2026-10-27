#!/usr/bin/env bash
# Installs this checkout as the runnable board: bundle built, no tests/dev files.
# Usage: scripts/install-board.sh [dest]   (default E:/Tools/beads-ui-board)
# Start it with ~/company/scripts/start-beads-ui.sh using BDUI_NEW=1.
set -e
DEST="${1:-E:/Tools/beads-ui-board}"
cd "$(dirname "$0")/.."
node scripts/build-frontend.js
mkdir -p "$DEST"
for d in app server bin; do
  rm -rf "$DEST/$d.new"; cp -r "$d" "$DEST/$d.new"
  rm -rf "$DEST/$d"; mv "$DEST/$d.new" "$DEST/$d"
done
cp package.json LICENSE "$DEST/"
[ -d "$DEST/node_modules" ] || cp -r node_modules "$DEST/node_modules"
find "$DEST/app" "$DEST/server" -name '*.test.js' -delete
echo "installed $(git rev-parse --short HEAD) -> $DEST"
