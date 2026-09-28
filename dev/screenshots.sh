#!/bin/sh
# Retakes the README / AnkiWeb screenshots from the dev preview with headless
# Chrome. Start the preview server first:
#   python3 dev/make_preview.py && python3 -m http.server 8791
set -e
cd "$(dirname "$0")/.."
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE="http://localhost:8791/dev"
shot() { # name width height url
  "$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size="$2,$3" --virtual-time-budget=9000 --screenshot="docs/$1.png" "$4" 2>/dev/null
  echo "docs/$1.png"
}
DECOR="bonsai,furin,kakejiku,maneki,daruma,kingyo,sakura,radio,tanuki,kamakura"
shot day 1000 655 "$BASE/anki_order.html?hour=11&rain=0&clean=1&species=puffle&puffle=blue&stage=2&owned=$DECOR,buncho,mike,shiba&guests=6&ff=14&energy=85"
shot night 1000 655 "$BASE/anki_order.html?hour=21&night=1&rain=0&clean=1&long=1&phase=break&species=cat&stage=3&owned=$DECOR,matsuri,usagi,kuro,puffle&puffle=pink&guests=5&ff=10&noanim=1"
shot starter 1000 655 "$BASE/anki_order.html?hour=10&rain=0&clean=1&fresh=1&noanim=1&js=setTimeout(()=>{document.querySelector('[data-species=puffle]').click();document.querySelector('[data-color=pink]').click()},200)"
shot pet 1000 655 "$BASE/anki_order.html?hour=15&rain=0&clean=1&species=puffle&puffle=blue&puffles=blue,pink,gold&stage=2&happy=1&owned=$DECOR&noanim=1&guests=0&panel=ok-b-pet"
shot shop 1000 655 "$BASE/anki_order.html?hour=15&rain=0&clean=1&species=cat&stage=2&mon=5200&owned=$DECOR,puffle,usagi&puffle=green&puffles=green&noanim=1&guests=0&panel=ok-b-decor"
shot widget 1000 560 "$BASE/widget.html"
sips --cropOffset 60 20 -c 820 1960 docs/widget.png >/dev/null # just the grid
