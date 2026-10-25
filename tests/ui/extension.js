// Real-browser check of the extension (Playwright + Chromium with the unpacked extension loaded).
//   node tests/ui/extension.js
// walmart.com pages are served from tests/fixtures/walmart-pages.json (real page data), and Open Food Facts from a
// fixture, so it runs offline.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
let chromium;
try { ({ chromium } = require("playwright")); } catch { console.log("SKIP extension check: playwright is not installed"); process.exit(0); }

const ROOT = path.join(__dirname, "..", "..");
const EXT = path.join(ROOT, "extension");
const PAGES = require(path.join(ROOT, "tests/fixtures/walmart-pages.json")).pages;
const BY_ID = { "363183524": "cheerios", "10450115": "milk", "5072512866": "oikos", "10315479": "peanut-butter", "51259338": "banana", "12166733": "coke", "99999999": "cable" };
PAGES.cable = { props: { pageProps: { initialData: { data: { product: { usItemId: "99999999", name: "HDMI Cable, 6 ft", upc: "012345678905", category: { path: [{ name: "Electronics" }] } }, idml: { nutritionFacts: null } } } } } };
const pageHtml = k => `<!doctype html><html><head><title>${k}</title></head><body><h1>${k}</h1><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(PAGES[k])}</script></body></html>`;
// Open Food Facts record for the peanut butter, in the shape the API returns (values from its live record, Oct 2026).
const OFF_PB = { status: 1, product: { product_name: "Creamy Peanut Butter", brands: "Great Value", serving_size: "2 tbsp (32 g)", serving_quantity: 32,
  nutriments: { "energy-kcal_serving": 180, fat_serving: 15, "saturated-fat_serving": 2.5, "trans-fat_serving": 0, cholesterol_serving: 0, sodium_serving: 0.135,
    carbohydrates_serving: 8, fiber_serving: 2, sugars_serving: 3, "added-sugars_serving": 3, proteins_serving: 7 }, categories_tags: ["en:spreads", "en:peanut-butters"],
  ingredients_text: "Roasted Peanuts, Sugar, Hydrogenated Vegetable Oil (Rapeseed, Cottonseed, Soybean), Salt, Molasses, Mono-and Diglycerides." } };

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) fails++; };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sib-ext-"));
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(dir, { channel: "chromium", headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  } catch (e) { console.log("SKIP extension check: this Chromium can't load extensions (" + e.message.split("\n")[0] + ")"); process.exit(0); }
  try {
    await ctx.route("https://www.walmart.com/**", r => {
      const id = (r.request().url().match(/\/ip\/(?:[^/?#]+\/)?(\d+)/) || [])[1];
      return BY_ID[id] ? r.fulfill({ contentType: "text/html", body: pageHtml(BY_ID[id]) }) : r.fulfill({ contentType: "text/html", body: "<!doctype html><title>Walmart</title><p>home</p>" });
    });
    await ctx.route("https://world.openfoodfacts.org/**", r => r.fulfill({ contentType: "application/json", body: JSON.stringify(/078742370033/.test(r.request().url()) ? OFF_PB : { status: 0 }) }));
    await ctx.route("https://api.nal.usda.gov/**", r => r.fulfill({ contentType: "application/json", body: JSON.stringify({ foods: [] }) }));
    let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 10000 });
    ok(!!sw, "extension loads (background service worker running)");

    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    const card = async () => { await page.waitForFunction(() => { const h = document.getElementById("should-i-buy-it-card"); return h && h.shadowRoot && !/Checking this product/.test(h.shadowRoot.textContent); }, null, { timeout: 10000 });
      return page.evaluate(() => [...document.getElementById("should-i-buy-it-card").shadowRoot.children].filter(c => c.tagName !== "STYLE").map(c => c.textContent).join(" ")); };

    await page.goto("https://www.walmart.com/ip/Oikos-Pro-23g-Protein-Vanilla-Yogurt/5072512866");
    let t = await card();
    ok(/Get it/.test(t) && /Per 3\/4 cup \(170g\) · from Walmart's Nutrition Facts panel/.test(t) && /23 g protein/.test(t), `Oikos Pro: Get it, from the page's own panel (${t.slice(0, 120)})`);
    await page.screenshot({ path: path.join(process.env.SHOTS_DIR || dir, "ext-oikos.png") });

    // Walmart changes pages without a reload: the card follows.
    await page.evaluate(() => history.pushState(null, "", "/ip/Cheerios-Heart-Healthy-Cereal/363183524"));
    await page.waitForFunction(() => /Cheerios/.test(document.getElementById("should-i-buy-it-card").shadowRoot.textContent), null, { timeout: 10000 });
    t = await card();
    ok(/In moderation/.test(t) && /Some added sugar: 10 g/.test(t), `client-side navigation to Cheerios updates the card (${t.slice(0, 100)})`);

    await page.goto("https://www.walmart.com/ip/Great-Value-Creamy-Peanut-Butter-40-oz-Jar/10315479");
    t = await card();
    ok(/Open Food Facts, by barcode 078742370033/.test(t) && /180 cal/.test(t) && /Full breakdown in the app/.test(t), `no panel: barcode lookup through the background (${t.slice(0, 140)})`);

    await page.goto("https://www.walmart.com/ip/Marketside-Fresh-Organic-Bananas-Bunch/51259338");
    t = await card();
    ok(/Get it/.test(t) && /Banana \(typical\)/.test(t) && /built-in “Banana”, matched by name/.test(t), `produce: matched by name, never by its sticker code (${t.slice(0, 120)})`);

    await page.goto("https://www.walmart.com/ip/Coca-Cola-Fridge-Pack/12166733");
    t = await card();
    ok(/neither Open Food Facts nor USDA has its barcode/.test(t), `not found anywhere: says so (${t.slice(0, 100)})`);

    await page.goto("https://www.walmart.com/ip/HDMI-Cable/99999999"); await page.waitForTimeout(1500);
    ok(await page.evaluate(() => !document.getElementById("should-i-buy-it-card")), "non-food products get no card");

    // Goals from the settings page change the verdict live (a low sodium limit and a skip term).
    const extId = sw.url().split("/")[2];
    await page.goto("https://www.walmart.com/ip/Cheerios-Heart-Healthy-Cereal/363183524"); await card();
    const opts = await ctx.newPage();
    await opts.goto(`chrome-extension://${extId}/options.html`);
    await opts.fill("#skip", "cheerios"); await opts.click("button[type=submit]");
    await opts.waitForFunction(() => /Saved/.test(document.getElementById("status").textContent));
    await page.bringToFront();
    await page.waitForFunction(() => /Skip/.test(document.getElementById("should-i-buy-it-card").shadowRoot.textContent), null, { timeout: 10000 });
    ok(/on your skip list/.test(await card()), "a skip term saved in settings turns Cheerios into Skip on the open page");
    // Import goals from the app's transfer link.
    const link = await opts.evaluate(async () => "https://quochhdo.github.io/self-check/#import=" + await SelfCheckBackup.encode(SelfCheckBackup.pack(k => k === "profile" ? { cal: 1850, pro: 140, sat: 13, na: 2300, add: 36, fib: 30, skip: "", mild: true } : undefined)));
    await opts.fill("#paste", link); await opts.click("#importBtn");
    await opts.waitForFunction(() => /imported/.test(document.getElementById("status").textContent));
    ok(await opts.evaluate(() => document.getElementById("pro").value === "140" && document.getElementById("mild").checked), "a transfer link from the app imports the goals");
    ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(fails ? `${fails} extension check(s) failed` : "All extension checks passed");
  process.exitCode = fails ? 1 : 0;
})();
