// Makes the Chrome Web Store images (store/): three 1280×800 screenshots of the real extension running in Chromium
// on a neutral mock store page (no store branding), and the 440×280 promo tile.
//   node scripts/store-assets.js
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { chromium } = require("playwright");
const ROOT = path.join(__dirname, ".."), EXT = path.join(ROOT, "extension"), OUT = path.join(ROOT, "store");
const { build, AUDIT } = require(path.join(ROOT, "tests/fixtures/walmart-compact.js"));
fs.mkdirSync(OUT, { recursive: true });

// Real captured nutrition panels under generic product names (no brands in the store images).
const PRODUCTS = [
  ["500101", "frosted flakes", "Frosted Corn Flakes Cereal, 30 oz", "#e8a33d"],
  ["500102", "chobani greek yogurt", "Greek Yogurt, Plain Nonfat, 32 oz", "#7fb0d8"],
  ["500103", "banquet chicken pot pie", "Chicken Pot Pie, Frozen, 7 oz", "#c96f4a"],
  ["500104", "great value frozen broccoli florets", "Frozen Broccoli Florets, 12 oz", "#5c9c5a"],
  ["500105", "oreo cookies", "Chocolate Sandwich Cookies, 24 oz", "#3b3b3b"],
  ["500106", "great value tilapia fillets", "Tilapia Fillets, Frozen, 2 lb", "#9fb7c4"],
  ["500107", "lays classic potato chips", "Classic Potato Chips, 13 oz", "#e3c440"],
  ["500108", "great value salted butter", "Salted Butter, 4 Sticks", "#f0d98a"],
];
const PB = { h: "500100 ¦ Creamy Peanut Butter, 16 oz ¦ 012345678905 ¦  ¦ Food > Pantry > Peanut butter & spreads > Peanut butter", ing: "Roasted peanuts, sugar, hydrogenated vegetable oils, salt, molasses.",
  rows: ["cal|Calories|190|", "k0|Total Fat|16g|21%", "k0+|Saturated Fat|3g|15%", "k0+|Trans Fat|0g|", "k1|Cholesterol|0mg|0%", "k2|Sodium|140mg|6%", "k3|Total Carbohydrate|8g|3%",
    "k3+|Dietary Fiber|2g|7%", "k3+|Total Sugars|3g|", "k3+>|Added Sugars|2g|4%", "k4|Protein|7g|", "serv|Servings Per Container|about 14|", "serv|Serving Size|2 tbsp (32g)|"] };
const pageData = { "500100": build(PB) };
for (const [id, k, name] of PRODUCTS) { const d = build(AUDIT[k]); d.product = { ...d.product, usItemId: id, name, brand: "" }; pageData[id] = d; }

const jar = (c, label) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#f4f5f2"/><rect x="58" y="34" width="84" height="24" rx="6" fill="#444"/><rect x="48" y="56" width="104" height="118" rx="18" fill="${c}"/><rect x="58" y="92" width="84" height="40" rx="6" fill="#fff" opacity=".9"/><text x="100" y="117" font-family="system-ui" font-size="13" text-anchor="middle" fill="#333">${label}</text></svg>`)}`;
const shell = (body) => `<!doctype html><html><head><meta charset="utf-8"><title>Store</title><style>
  body{margin:0;font:15px/1.45 system-ui,sans-serif;color:#1d1f1a;background:#fff}
  .bar{height:64px;background:#2f3a4a;display:flex;align-items:center;gap:16px;padding:0 28px;color:#fff;font-weight:700}
  .bar .s{flex:1;max-width:560px;height:38px;border-radius:19px;background:#fff;color:#888;font-weight:400;display:flex;align-items:center;padding:0 16px}
  .cap{position:absolute;left:28px;bottom:28px;max-width:560px;background:#1d1f1a;color:#fff;border-radius:14px;padding:16px 20px;font:600 22px/1.3 system-ui}
  .cap small{display:block;font:400 15px/1.4 system-ui;color:#cfd3c8;margin-top:6px}
</style></head><body>${body}</body>
<script id="__NEXT_DATA__" type="application/json">__DATA__</script></html>`;
const productHtml = id => shell(`<div class="bar">Grocery<div class="s">Search groceries</div></div>
  <div style="display:grid;grid-template-columns:420px 1fr;gap:40px;padding:36px 28px">
    <img src="${jar("#b07a3c", "PEANUT")}" width="420" height="420" alt="">
    <div><div style="color:#666">Pantry › Peanut butter</div><h1 style="font-size:28px;margin:6px 0 10px">${pageData[id].product.name}</h1>
      <div style="font:700 30px system-ui">$2.48</div><div style="color:#666;margin:6px 0 18px">15.5¢/oz</div>
      <button style="font:700 16px system-ui;background:#2f6fd6;color:#fff;border:0;border-radius:22px;padding:12px 34px">Add to cart</button></div></div>
  <div class="cap">A verdict on every food product page<small>Scored against your own goals, with the reasons and a better swap.</small></div>`)
  .replace("__DATA__", JSON.stringify({ props: { pageProps: { initialData: { data: pageData[id] } } } }));
const searchHtml = () => shell(`<div class="bar">Grocery<div class="s">snacks and staples</div></div>
  <div style="display:grid;grid-template-columns:repeat(4,280px);gap:22px;padding:28px">${PRODUCTS.map(([id, , name, c]) =>
    `<div data-item-id="T${id}" role="group"><div><img src="${jar(c, name.split(" ")[0].toUpperCase())}" width="280" height="190" style="object-fit:cover;border-radius:10px" alt=""></div>
     <a href="/ip/${encodeURIComponent(name.replace(/\W+/g, "-"))}/${id}" style="color:#1d1f1a;text-decoration:none;display:block;margin-top:6px">${name}</a></div>`).join("")}</div>
  <div class="cap" style="bottom:22px">Optional badges on search results<small>Turn them on in settings. Fetched gently, one product at a time.</small></div>`).replace("__DATA__", "{}");

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sib-store-"));
  const ctx = await chromium.launchPersistentContext(dir, { channel: "chromium", headless: true, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  try {
    await ctx.route("https://www.walmart.com/**", r => {
      const u = r.request().url(), id = (u.match(/\/ip\/(?:[^/?#]+\/)?(\d+)/) || [])[1];
      if (/\/search/.test(u)) return r.fulfill({ contentType: "text/html", body: searchHtml() });
      return r.fulfill({ contentType: "text/html", body: id && pageData[id] ? productHtml(id) : "<!doctype html><p>home" });
    });
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
    await sw.evaluate(() => chrome.storage.local.set({ collapsed: false, searchBadges: true, badgeCache: {} }));
    const page = await ctx.newPage();
    // 1. product page, card open, with "About this verdict" closed.
    await page.goto("https://www.walmart.com/ip/Creamy-Peanut-Butter/500100");
    await page.waitForFunction(() => { const h = document.getElementById("should-i-buy-it-card"); return h && h.shadowRoot.querySelector(".card .verdict"); });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "screenshot-1-card.png") });
    // 2. search page with badges.
    await page.goto("https://www.walmart.com/search?q=snacks");
    await page.waitForFunction(() => document.querySelectorAll(".sib-badge").length >= 8 && ![...document.querySelectorAll(".sib-badge")].some(b => /…/.test(b.shadowRoot.textContent)), null, { timeout: 30000 });
    await page.screenshot({ path: path.join(OUT, "screenshot-2-search.png") });
    // 3. settings.
    const extId = sw.url().split("/")[2];
    await page.goto(`chrome-extension://${extId}/options.html`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "screenshot-3-settings.png") });
    // Promo tile.
    const icon = "data:image/png;base64," + fs.readFileSync(path.join(EXT, "icons/icon-128.png")).toString("base64");
    const tile = await ctx.newPage();
    await tile.setViewportSize({ width: 440, height: 280 });
    await tile.setContent(`<body style="margin:0;width:440px;height:280px;background:#2b7742;display:grid;place-items:center;font-family:system-ui;color:#fff">
      <div style="display:flex;align-items:center;gap:18px;padding:0 28px"><img src="${icon}" width="88" height="88" style="border-radius:20px;background:#fff">
      <div><div style="font:800 30px/1.1 system-ui">Should I Buy It?</div><div style="font:500 17px/1.35 system-ui;margin-top:8px;color:#dff0e2">Nutrition verdicts on the products you shop for. Free and private.</div></div></div></body>`);
    await tile.screenshot({ path: path.join(OUT, "promo-small.png") });
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  console.log("Wrote store/: screenshot-1-card.png, screenshot-2-search.png, screenshot-3-settings.png, promo-small.png");
})();
