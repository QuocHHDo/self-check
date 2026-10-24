// Real-browser layout checks (Playwright + Chromium): things jsdom can't measure.
//   node tests/ui/layout.js            (needs `playwright` and a Chromium; skipped with a note if missing)
// Serves the repo on a local port and mocks USDA / Open Food Facts with the test fixtures, so it runs offline.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

let chromium;
try { ({ chromium } = require("playwright")); } catch { console.log("SKIP layout checks: playwright is not installed"); process.exit(0); }

const ROOT = path.join(__dirname, "..", "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const fixture = n => fs.readFileSync(path.join(ROOT, "tests", "fixtures", n), "utf8");

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) fails++; };

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    }).listen(0, () => resolve(srv));
  });
}

async function newPage(browser, base, width, height = 800) {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.route("**/api.nal.usda.gov/**", r => r.fulfill({ contentType: "application/json", body: fixture("usda-search.json") }));
  await page.route("**/world.openfoodfacts.org/**", r => r.fulfill({ contentType: "application/json", body: fixture("off-nutella.json") }));
  page.on("pageerror", e => { fails++; console.log("FAIL page error: " + e.message); });
  await page.goto(base);
  await page.waitForSelector("#out h2");
  return { ctx, page };
}

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: false }); };

async function openFood(page, name) {
  await page.fill("#q", name);
  await page.press("#q", "Enter");
  await page.waitForFunction(n => document.querySelector("#out h2")?.textContent === n, name);
}

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 375]) {
      const { ctx, page } = await newPage(browser, base, width);
      await openFood(page, "Ground beef 80/20");
      // 11. Saving must not move the action buttons or the label.
      const boxes = () => page.$$eval("#out .result-head .icon-btn, #out .label", els => els.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width)]; }));
      const before = await boxes();
      await shot(page, `11-before-save-${width}`);
      await page.click("#out .result-head .icon-btn[aria-pressed]");
      await page.waitForFunction(() => document.querySelector("#out .result-head .icon-btn[aria-pressed]").getAttribute("aria-pressed") === "true");
      const after = await boxes();
      await shot(page, `11-after-save-${width}`);
      ok(JSON.stringify(before) === JSON.stringify(after), `${width}px: Save doesn't move the buttons or label (${JSON.stringify(before)} → ${JSON.stringify(after)})`);
      // Saving several more foods keeps the shelf one line high.
      const shelfH = await page.$eval("#shelf", e => e.getBoundingClientRect().height);
      for (const n of ["Avocado", "Eggs", "Shrimp", "Oatmeal, rolled oats", "Instant ramen"]) { await openFood(page, n); await page.click("#out .result-head .icon-btn[aria-pressed]"); }
      ok(Math.abs(await page.$eval("#shelf", e => e.getBoundingClientRect().height) - shelfH) < 1, `${width}px: favorites shelf keeps its height`);
      await ctx.close();
    }
    // 15. Phones: verdict above the label and above the fold; nothing wider than the screen.
    for (const [width, height] of [[320, 568], [375, 667], [414, 896]]) {
      const { ctx, page } = await newPage(browser, base, width, height);
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const states = {
        "result": async () => openFood(page, "Ground beef 80/20"),
        "long name": async () => openFood(page, "Bubble milk tea, regular sugar"),
        "compare": async () => { await page.fill("#cmpq", "chicken breast"); await page.waitForSelector(".compare .suggest li"); await page.dispatchEvent(".compare .suggest li", "mousedown"); await page.waitForSelector(".ctable"); },
        "barcode": async () => { await page.fill("#q", "3017620422003"); await page.press("#q", "Enter"); await page.waitForFunction(() => /Nutella/i.test(document.querySelector("#out h2")?.textContent || "")); },
        "browse": async () => { await page.evaluate(() => { document.getElementById("browse").open = true; }); await page.waitForSelector("#blist .bitem"); },
        "quiz": async () => { await page.evaluate(() => { document.getElementById("learn").open = true; }); },
        "plate": async () => { await openFood(page, "Brown rice"); await page.click("text=Add 1 to plate"); await page.evaluate(() => { document.getElementById("plateBox").open = true; }); await page.click("#plateView"); await page.waitForFunction(() => document.querySelector("#out h2")?.textContent === "Your plate"); },
      };
      for (const [name, go] of Object.entries(states)) {
        await go();
        ok(await overflow() <= 0, `${width}px ${name}: no horizontal scroll (overflow ${await overflow()} px)`);
      }
      await openFood(page, "Ground beef 80/20");
      await page.evaluate(() => window.scrollTo(0, 0));
      const pos = await page.evaluate(() => {
        const t = document.querySelector("#out .tag .verdict").getBoundingClientRect(), l = document.querySelector("#out .label").getBoundingClientRect();
        return { tagTop: t.top, tagBottom: t.bottom, labelTop: l.top, vh: innerHeight };
      });
      ok(pos.tagTop < pos.labelTop, `${width}px: verdict comes before the label (${Math.round(pos.tagTop)} < ${Math.round(pos.labelTop)})`);
      ok(pos.tagBottom <= pos.vh, `${width}px: verdict is above the fold (bottom ${Math.round(pos.tagBottom)} of ${pos.vh})`);
      const shelf = await page.evaluate(() => { const s = document.getElementById("shelf"); return { h: s.getBoundingClientRect().height, scroll: s.scrollWidth > s.clientWidth, style: getComputedStyle(s).overflowX }; });
      ok(shelf.h < 48 && shelf.style === "auto", `${width}px: recents and favorites stay on one scrolling row (${Math.round(shelf.h)} px tall)`);
      await shot(page, `15-mobile-${width}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(fails ? `${fails} layout check(s) failed` : "All layout checks passed");
  process.exit(fails ? 1 : 0);
})();
