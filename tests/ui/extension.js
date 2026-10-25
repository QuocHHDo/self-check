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
// Open Food Facts record for the peanut butter's barcode. Values and the other store's brand name are as in the card the
// user saw on a real page (Oct 25, 2026): a barcode record can carry another store's name.
const OFF_PB = { status: 1, product: { product_name: "Hannaford Peanut butter", serving_size: "2 tbsp. (32 g)", serving_quantity: 32,
  nutriments: { "energy-kcal_serving": 180, fat_serving: 16, "saturated-fat_serving": 3, "trans-fat_serving": 0, cholesterol_serving: 0, sodium_serving: 0.135,
    carbohydrates_serving: 7, fiber_serving: 2, sugars_serving: 3, "added-sugars_serving": 2, proteins_serving: 7 }, categories_tags: ["en:spreads", "en:nut-butters", "en:peanut-butters"], nova_group: 4,
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
    const hits = { ip: [], off: 0 };
    const SEARCH = `<!doctype html><title>search</title><div style="display:grid;grid-template-columns:repeat(4,240px);gap:12px">${[["Oikos-Pro", "5072512866"], ["Cheerios", "363183524"], ["Bananas", "51259338"], ["HDMI-Cable", "99999999"]]
      .map(([n, id]) => `<div data-item-id="T${id}" role="group" style="height:300px;border:1px solid #ddd"><div style="height:200px;background:#eee"><img alt="" width="200" height="200" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></div><a href="/ip/${n}/${id}">${n}</a></div>`).join("")}</div>`;
    await ctx.route("https://www.walmart.com/**", r => {
      if (/\/search\?/.test(r.request().url())) return r.fulfill({ contentType: "text/html", body: SEARCH });
      const id = (r.request().url().match(/\/ip\/(?:[^/?#]+\/)?(\d+)/) || [])[1];
      if (id) hits.ip.push({ id, t: Date.now() });
      return BY_ID[id] ? r.fulfill({ contentType: "text/html", body: pageHtml(BY_ID[id]) }) : r.fulfill({ contentType: "text/html", body: "<!doctype html><title>Walmart</title><p>home</p>" });
    });
    await ctx.route("https://world.openfoodfacts.org/**", r => (hits.off++, r.fulfill({ contentType: "application/json", body: JSON.stringify(/078742370033/.test(r.request().url()) ? OFF_PB : { status: 0 }) })));
    await ctx.route("https://api.nal.usda.gov/**", r => r.fulfill({ contentType: "application/json", body: JSON.stringify({ foods: [] }) }));
    let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 10000 });
    ok(!!sw, "extension loads (background service worker running)");

    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    const root = () => page.evaluateHandle(() => document.getElementById("should-i-buy-it-card").shadowRoot);
    const card = async () => { await page.waitForFunction(() => { const h = document.getElementById("should-i-buy-it-card"); return h && h.shadowRoot && h.shadowRoot.querySelector(".wrap") && !/Checking this product/.test(h.shadowRoot.textContent); }, null, { timeout: 10000 });
      return page.evaluate(() => document.getElementById("should-i-buy-it-card").shadowRoot.querySelector(".wrap").innerText.replace(/\s+/g, " ")); };
    const click = async sel => page.evaluate(s => document.getElementById("should-i-buy-it-card").shadowRoot.querySelector(s).click(), sel);
    const box = () => page.evaluate(() => { const e = document.getElementById("should-i-buy-it-card").shadowRoot.querySelector(".card, .chip"); const r = e.getBoundingClientRect(); return { h: r.height, bottom: innerHeight - r.bottom, right: innerWidth - r.right, chip: e.classList.contains("chip") }; });

    await page.goto("https://www.walmart.com/ip/Oikos-Pro-23g-Protein-Vanilla-Yogurt/5072512866");
    let t = await card();
    let b = await box();
    ok(b.chip && /^Get it High protein for the calories\./.test(t), `starts compact: verdict and its reason (${t})`);
    ok(b.bottom >= 80 && b.right >= 12, `sits above the bottom-right corner, clear of Walmart's own button (${Math.round(b.bottom)} px up)`);
    await page.screenshot({ path: path.join(process.env.SHOTS_DIR || dir, "ext2-chip.png"), clip: { x: 880, y: 560, width: 400, height: 240 } });
    await click(".chip");
    t = await card(); b = await box();
    ok(!b.chip && /Oikos Pro 23g Protein Vanilla/.test(t) && /Sat fat 2.5 g · 13%/.test(t) && /From this page/.test(t), `expands to the card: Walmart's name, limit bars, source (${t.slice(0, 160)})`);
    ok(b.h <= 460, `expanded card stays compact (${Math.round(b.h)} px tall)`);

    // Walmart changes pages without a reload: the card follows, and stays open now that it was opened.
    await page.evaluate(() => history.pushState(null, "", "/ip/Cheerios-Heart-Healthy-Cereal/363183524"));
    await page.waitForFunction(() => /Cheerios/.test(document.getElementById("should-i-buy-it-card").shadowRoot.textContent), null, { timeout: 10000 });
    t = await card();
    ok(/In moderation/.test(t) && /A good fiber source, but 20% of your added-sugar limit\./.test(t), `Cheerios: headline names the trade-off (${t.slice(0, 120)})`);
    const swapHref = await page.evaluate(() => { const a = [...document.getElementById("should-i-buy-it-card").shadowRoot.querySelectorAll(".swap a")][0]; return a && a.href; });
    ok(/TRY INSTEAD Toasted oat cereal, plain GET IT/i.test(t) && swapHref === "https://www.walmart.com/search?q=toasted%20oat%20cereal", `Try instead links to a Walmart search (${swapHref})`);

    await page.goto("https://www.walmart.com/ip/Great-Value-Creamy-Peanut-Butter-40-oz-Jar/10315479");
    t = await card();
    ok(/Great Value Creamy Peanut Butter, 40 oz/.test(t) && !/Hannaford Peanut butter Mostly/.test(t), `shows Walmart's product name, not the barcode record's (${t.slice(0, 90)})`);
    ok(/Mostly healthy fats, but 15% of your saturated-fat limit\./.test(t) && /Sat fat 3 g · 15%/.test(t) && /Sodium 135 mg · 6%/.test(t), `peanut butter: one-line reason and bars (${t.slice(0, 200)})`);
    ok(/2 more notes/.test(t) && !/Ultra-processed/.test(t) && /TRY INSTEAD Powdered peanut butter/i.test(t), "secondary notes are folded away; a swap is offered");
    await click(".foot details > summary");
    t = await card();
    ok(/listed there as “Hannaford Peanut butter”/.test(t) && /Open Food Facts' record for barcode 078742370033/.test(t), "About this verdict explains the source, including the other name");
    await page.screenshot({ path: path.join(process.env.SHOTS_DIR || dir, "ext2-card.png"), clip: { x: 880, y: 140, width: 400, height: 580 } });

    // Add to the app's list: the button toggles, and a send link carries the item to the app.
    await click(".lbtn");
    t = await card();
    const sendHref = await page.evaluate(async () => { await new Promise(r => setTimeout(r, 300)); const a = document.getElementById("should-i-buy-it-card").shadowRoot.querySelector(".send"); return a && a.href; });
    ok(/✓ Added to list/.test(t) && /Send 1 to your list in the app/.test(t) && /#add=z\./.test(sendHref || ""), `+ Add to list, then a send link for the app (${(sendHref || "").slice(0, 60)}…)`);
    // Cached: the same product again doesn't ask Open Food Facts a second time.
    const offBefore = hits.off;
    await page.goto("https://www.walmart.com/ip/Great-Value-Creamy-Peanut-Butter-40-oz-Jar/10315479"); await card();
    ok(hits.off === offBefore, `a barcode looked up once is cached (${offBefore} → ${hits.off} Open Food Facts requests)`);
    await click('button[aria-label="Minimize"]');
    t = await card();
    ok((await box()).chip && /^In moderation Mostly healthy fats/.test(t), "minimize returns to the compact chip");

    await page.goto("https://www.walmart.com/ip/Marketside-Fresh-Organic-Bananas-Bunch/51259338");
    t = await card();
    ok(/^Get it/.test(t) && (await box()).chip, `stays compact after minimizing (${t})`);
    await click(".chip"); t = await card();
    ok(/Marketside Fresh Organic Bananas/.test(t) && /From typical banana/.test(t), `produce: Walmart's name, typical values by name match (${t.slice(0, 140)})`);

    await page.goto("https://www.walmart.com/ip/Coca-Cola-Fridge-Pack/12166733");
    t = await card();
    ok(/Open Food Facts and USDA don't have its barcode/.test(t), `not found anywhere: says so (${t.slice(0, 100)})`);

    await page.goto("https://www.walmart.com/ip/HDMI-Cable/99999999"); await page.waitForTimeout(1500);
    ok(await page.evaluate(() => !document.getElementById("should-i-buy-it-card")), "non-food products get no card");

    // Search badges: off by default; when on, only visible products, one request at a time, at least 1.5 s apart.
    await page.goto("https://www.walmart.com/search?q=yogurt"); await page.waitForTimeout(2000);
    ok(await page.evaluate(() => !document.querySelector(".sib-badge")), "search badges are off by default");
    await sw.evaluate(() => chrome.storage.local.set({ searchBadges: true, badgeCache: {} }));
    hits.ip = [];
    await page.goto("https://www.walmart.com/search?q=yogurt");
    await page.waitForFunction(() => document.querySelectorAll(".sib-badge").length >= 3 && [...document.querySelectorAll(".sib-badge")].every(b => !/…/.test(b.shadowRoot.textContent)), null, { timeout: 20000 });
    const badges = await page.evaluate(() => [...document.querySelectorAll("[data-item-id]")].map(t => { const b = t.querySelector(".sib-badge"); return b ? b.shadowRoot.querySelector(".b").textContent : "-"; }));
    ok(badges[0] === "Get it" && badges[1] === "In moderation" && badges[2] === "Get it" && badges[3] === "-", `badges show each product's verdict; non-food gets none (${badges.join(" | ")})`);
    const gaps = hits.ip.slice(1).map((h, i) => h.t - hits.ip[i].t);
    ok(hits.ip.length === 4 && gaps.every(g => g >= 1400), `one product page at a time, ${gaps.map(g => (g / 1000).toFixed(1) + " s").join(", ")} apart`);
    await page.screenshot({ path: path.join(process.env.SHOTS_DIR || dir, "ext3-badges.png"), clip: { x: 0, y: 0, width: 1000, height: 330 } });
    hits.ip = [];
    await page.goto("https://www.walmart.com/search?q=yogurt");
    await page.waitForFunction(() => document.querySelectorAll(".sib-badge").length >= 3, null, { timeout: 10000 });
    ok(hits.ip.length === 0, `badges come from the cache on the next visit (${hits.ip.length} page requests)`);
    await sw.evaluate(() => chrome.storage.local.set({ searchBadges: false }));

    // Goals from the settings page change the verdict live (a low sodium limit and a skip term).
    const extId = sw.url().split("/")[2];
    await page.goto("https://www.walmart.com/ip/Cheerios-Heart-Healthy-Cereal/363183524"); await card();
    const opts = await ctx.newPage();
    await opts.goto(`chrome-extension://${extId}/options.html`);
    await opts.fill("#skip", "cheerios"); await opts.click("button[type=submit]");
    await opts.waitForFunction(() => /Saved/.test(document.getElementById("status").textContent));
    await page.bringToFront();
    await page.waitForFunction(() => /Skip/.test(document.getElementById("should-i-buy-it-card").shadowRoot.textContent), null, { timeout: 10000 });
    ok(await page.evaluate(() => document.getElementById("should-i-buy-it-card").shadowRoot.querySelector(".verdict, .w").textContent.includes("Skip")) && /on your skip list/.test(await card()), "a skip term saved in settings turns Cheerios into Skip on the open page");
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
