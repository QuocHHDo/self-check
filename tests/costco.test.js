// js/costco.js: reading Costco product pages (JSON-LD plus the item's record in the page data).
const { test } = require("node:test");
const assert = require("node:assert");
const C = require("../js/costco.js");
const W = require("../js/walmart.js");
const { FOODS } = require("../js/foods.js");
const F = require("./fixtures/costco-live.js");

test("product ids from both of Costco's URL formats; other pages have none", () => {
  assert.equal(C.productId("https://www.costco.com/p/-/general-mills-cheerios-cereal-2035-oz-2-count/100381496"), "100381496");
  assert.equal(C.productId("https://www.costco.com/p/-/general-mills-cheerios-cereal-2035-oz-2-count/100381496?langId=-1"), "100381496");
  assert.equal(C.productId("https://www.costco.com/cheerios-cereal.product.100381496.html"), "100381496");
  assert.equal(C.productId("https://www.costco.com/s?keyword=cereal"), null);
  assert.equal(C.productId("https://www.costco.com/grocery-household.html"), null);
});

test("Cheerios: name, item number, barcode, brand, category without Home, price per ounce", () => {
  const p = C.product(F.html("cheerios"));
  assert.equal(p.name, "General Mills Cheerios Cereal, 20.35 oz, 2-count");
  assert.equal(p.id, "522107");
  assert.equal(p.upc, "016000435094");
  assert.equal(p.brand, "Cheerios");
  assert.deepEqual(p.category, ["Grocery & Household Essentials", "Breakfast", "Cereal"]);
  assert.equal(p.dept, "FOOD");
  assert.equal(p.nutrition, null);
  assert.equal(p.price.now, 8.49);
  assert.equal(p.price.text, "$0.21/oz");
  assert.deepEqual(C.plan(p), { kind: "barcode", code: "016000435094" });
});

test("the same from a parsed document as from fetched HTML", () => {
  // A minimal document stand-in: querySelectorAll over the page's scripts.
  const src = F.html("pb");
  const scripts = [...src.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map(m => ({ ld: /ld\+json/.test(m[1]), textContent: m[2] }));
  const doc = { querySelectorAll: sel => scripts.filter(s => /ld\+json/.test(sel) ? s.ld : !s.ld) };
  assert.deepEqual(C.product(doc), C.product(src));
  assert.equal(C.product(doc).upc, "096619555017");
});

test("bananas go by name to the app's typical values, not Costco's own produce code", () => {
  const pl = C.plan(C.product(F.html("bananas")));
  assert.equal(pl.kind, "name");
  assert.equal(W.byName(pl.query, FOODS).n, "Banana");
});

test("paper towels are not food, though Costco files them under grocery", () => {
  const p = C.product(F.html("towels"));
  assert.ok(p.category.some(c => /grocery/i.test(c)));
  assert.deepEqual(C.plan(p), { kind: "none", why: "Not a food." });
});

test("vitamin D3 is a supplement", () => {
  assert.equal(C.plan(C.product(F.html("d3"))).kind, "supplement");
});

test("pages without a Product block, or without the item's record, are handled", () => {
  assert.equal(C.product("<html><body>search results</body></html>"), null);
  assert.equal(C.product(null), null);
  const p = C.product(F.html("cheerios").replace(/self\.__next_f[^<]*/, ""));
  assert.equal(p.upc, "");
  assert.equal(p.price.text, "");
  assert.equal(C.plan(p).kind, "none");
});

test("STORES knows Costco and its search", () => {
  assert.equal(W.storeOf("www.costco.com").id, "costco");
  assert.equal(W.storeSearch("oat milk", "costco"), "https://www.costco.com/s?keyword=oat%20milk");
});
