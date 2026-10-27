// Opens the kitchen in a real (headless) browser the way Anki loads it, lets guests
// arrive, eat and pay, opens the panels, and fails on any script error. CI runs this;
// it needs playwright (npm i --no-save playwright && npx playwright install chromium).
//   python3 dev/make_preview.py && node tests/kitchen_smoke.js
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, () => ok(server)));
}

async function main() {
  const server = await serve();
  const base = `http://localhost:${server.address().port}/dev`;
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const problems = [];
  const check = (cond, what) => { if (!cond) problems.push(what); };

  async function open(url, name) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    page.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`${name} console: ${m.text()}`); });
    page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) problems.push(`${name}: ${r.status()} ${r.url()}`); });
    await page.goto(url);
    return page;
  }

  // 1. the restaurant: guests arrive, are seated, eat and pay (the page talks to Python through pycmd)
  // (log every message the page sends, and still let the preview's own stand-in for Python answer it)
  let page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  page.on('pageerror', (e) => problems.push(`kitchen: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`kitchen console: ${m.text()}`); });
  await page.addInitScript(() => {
    window.__sent = [];
    let real = null;
    Object.defineProperty(window, 'pycmd', {
      configurable: true,
      set(f) { real = f; },
      get() { return real && ((msg, cb) => { window.__sent.push(msg); return real(msg, cb); }); },
    });
  });
  await page.goto(`${base}/anki_order.html?hour=21&night=1&ff=60`);
  await page.waitForFunction(() => window.__sent.some((m) => m.startsWith('okitchen:pay')), null, { timeout: 90000 }).catch(() => {});
  const sent = await page.evaluate(() => window.__sent);
  const pay = sent.find((m) => m.startsWith('okitchen:pay:'));
  check(sent.some((m) => m.startsWith('okitchen:claim')), 'kitchen: no guest was ever claimed');
  check(!!pay, 'kitchen: no guest ever paid');
  if (pay) {
    const info = JSON.parse(pay.slice('okitchen:pay:'.length));
    check(Number.isInteger(info.base) && Number.isInteger(info.dishBonus) && ['regular', 'golden', 'leech'].includes(info.kind), `kitchen: odd pay message ${pay}`);
  }
  const mon = await page.evaluate(() => document.getElementById('ok-mon').textContent);
  check(/^[\d,. ]+$/.test(mon.trim()), `kitchen: the purse shows "${mon}" after tips were paid`);
  for (const id of ['ok-b-decor', 'ok-b-pet', 'ok-t-set']) {
    await page.click(`#${id}`);
    await page.waitForTimeout(300);
    check(await page.evaluate(() => !!document.querySelector('.ok-panel:not([hidden])')), `kitchen: ${id} opened no panel`);
    await page.keyboard.press('Escape');
  }
  await page.close();

  // 2. the starter chooser on a first visit
  page = await open(`${base}/anki_order.html?hour=10&fresh=1&noanim=1`, 'chooser');
  await page.waitForTimeout(1500);
  check(await page.evaluate(() => !!document.querySelector('.ok-starter-opt')), 'chooser: no starter pets shown');
  await page.close();

  // 3. the Stats window with the demo data
  page = await open(`${base}/stats_order.html?page=rev`, 'stats');
  await page.waitForTimeout(800);
  await page.close();

  await browser.close();
  server.close();
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log('kitchen page runs: guests claimed and paid, panels open, no script errors');
}

main().catch((e) => { console.error(e); process.exit(1); });
