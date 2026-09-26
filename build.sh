#!/bin/sh
# Builds two packages from onigiri_kitchen/:
#   dist/onigiri_kitchen.ankiaddon   - double-click install / GitHub releases
#   dist/onigiri_kitchen-ankiweb.zip - upload to AnkiWeb (no manifest.json)
set -e
cd "$(dirname "$0")"
mkdir -p dist
rm -f dist/onigiri_kitchen.ankiaddon dist/onigiri_kitchen-ankiweb.zip
find onigiri_kitchen -name "__pycache__" -type d -exec rm -rf {} +
EXCLUDES='__pycache__/* */__pycache__/* *.pyc .DS_Store */.DS_Store user_files/kitchen_*.json user_files/*.tmp user_files/debug_log.txt meta.json'
cd onigiri_kitchen
# shellcheck disable=SC2086
zip -qr -X ../dist/onigiri_kitchen.ankiaddon . -x $EXCLUDES
# shellcheck disable=SC2086
zip -qr -X ../dist/onigiri_kitchen-ankiweb.zip . -x $EXCLUDES manifest.json
cd ..
echo "Built dist/onigiri_kitchen.ankiaddon and dist/onigiri_kitchen-ankiweb.zip"
