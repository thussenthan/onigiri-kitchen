#!/bin/sh
# Everything GitHub Actions runs, locally. Run it before every push:   dev/check.sh
# Needs: python3 with pytest and pyflakes (python3 -m venv .venv && .venv/bin/pip install pytest pyflakes),
# node/npx, and for the browser test playwright (npm i --no-save playwright) plus Google Chrome or
# playwright's own browser. The Anki check needs `pip install aqt` and is skipped without it.
cd "$(dirname "$0")/.."
PY=python3
[ -x .venv/bin/python ] && PY=.venv/bin/python
fail() { echo "FAILED: $1"; exit 1; }
step() { echo "== $1"; }

$PY -c "import pytest, pyflakes" 2>/dev/null || fail "python needs pytest and pyflakes (python3 -m venv .venv && .venv/bin/pip install pytest pyflakes)"

step "pyflakes"
out=$($PY -m pyflakes onigiri_kitchen tests tests_main dev | grep -v "imported but unused" || true)
[ -z "$out" ] || { echo "$out"; fail "pyflakes"; }
step "tests"
$PY -m pytest -q tests || fail "tests"
step "tests_main"
$PY -m pytest -q tests_main || fail "tests_main"
step "scripts parse and lint"
for f in onigiri_kitchen/web/*.js; do node --check "$f" || fail "$f"; done
npx --yes eslint@9.14.0 --no-warn-ignored onigiri_kitchen/web tests/*.js || fail "eslint"
step "stats page"
node tests/stats_smoke.js || fail "stats smoke"
step "kitchen page in a browser"
$PY dev/make_preview.py > /dev/null
if [ -d node_modules/playwright ] || [ -n "$NODE_PATH" ]; then
  [ -z "$PW_CHANNEL" ] && [ -d "/Applications/Google Chrome.app" ] && export PW_CHANNEL=chrome
  node tests/kitchen_smoke.js || fail "kitchen smoke"
else
  fail "playwright isn't installed (npm i --no-save playwright), so the browser test can't run"
fi
step "release is consistent"
$PY dev/release_check.py || fail "release check"
step "anki's side"
if $PY -c "import aqt" 2>/dev/null; then
  QT_QPA_PLATFORM=offscreen $PY tests/anki_compat.py || fail "anki compat"
else
  echo "(aqt isn't installed here: skipped; CI runs it)"
fi
step "build"
./build.sh > /dev/null || fail "build"
echo "ALL CHECKS PASSED"
