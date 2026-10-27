// Loads the Stats page script with the demo data and a bare-bones page, and
// renders every page at every range. Catches a broken or truncated script and
// any page that throws. Run: node tests/stats_smoke.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const mock = read('dev/stats_mock.js');
const script = read('onigiri_kitchen/web/stats.js');

function render(page, range) {
  const els = {};
  const el = (id) => (els[id] = els[id] || { id, innerHTML: '', hidden: false, textContent: '', style: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, setAttribute() {}, addEventListener() {} });
  const noop = () => {};
  const win = {
    location: { search: `?page=${page}&range=${range}` },
    document: {
      readyState: 'complete',
      getElementById: el,
      querySelectorAll: () => [],
      addEventListener: noop,
      body: { classList: { contains: () => false, toggle: noop }, dataset: {} },
      documentElement: { classList: { contains: () => false, toggle: noop } },
    },
    localStorage: { getItem: () => null, setItem: noop },
    setInterval: noop,
    scrollTo: noop,
    innerWidth: 1000,
    innerHeight: 800,
  };
  win.window = win;
  win.location = win.location;
  vm.createContext(win);
  vm.runInContext(mock, win);
  vm.runInContext(script, win);
  return els;
}

let failed = 0;
const check = (name, ok) => { if (!ok) { failed++; console.error('FAIL', name); } };

for (const range of ['7', '30', '365', 'all']) {
  for (const page of ['today', 'rev', 'pomo', 'kitchen', 'rec']) {
    const name = `${page} @ ${range}`;
    try {
      const els = render(page, range);
      const html = els[`oks-${page}`].innerHTML;
      check(`${name}: has content`, html.length > 500);
      check(`${name}: no undefined or NaN`, !/undefined|NaN/.test(html));
      if (page === 'rec') check(`${name}: lists records`, html.includes('Cards answered') && html.includes('Longest session'));
      if (page === 'rev') check(`${name}: grouped tiles`, html.includes('oks-group'));
    } catch (e) {
      failed++;
      console.error('FAIL', name, e.message);
    }
  }
}
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('stats pages render at every range');
