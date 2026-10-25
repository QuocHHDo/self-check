// The extension's Walmart page reader, on real product-page data captured Oct 25, 2026 (tests/fixtures/walmart-pages.json).
const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../js/walmart.js");
const V = require("../js/verdict.js");
const { FOODS } = require("../js/foods.js");
const PAGES = require("./fixtures/walmart-pages.json").pages;
const html = k => `<!doctype html><html><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(PAGES[k])}</script></body></html>`;
const page = k => W.product(W.nextData(html(k)));
const P = V.DEFAULT_PROFILE;

test("product id comes from the URL", () => {
  assert.equal(W.productId("https://www.walmart.com/ip/Great-Value-Creamy-Peanut-Butter-40-oz-Jar/10315479"), "10315479");
  assert.equal(W.productId("https://www.walmart.com/ip/10315479?athbdg=L1600"), "10315479");
  assert.equal(W.productId("https://www.walmart.com/search?q=milk"), null);
});

test("Cheerios: a flat panel with full nutrient names", () => {
  const f = W.plan(page("cheerios")).food;
  assert.deepEqual({ cal: f.cal, fat: f.fat, sat: f.sat, trans: f.trans, chol: f.chol, na: f.na, carb: f.carb, fib: f.fib, sug: f.sug, add: f.add, pro: f.pro },
    { cal: 140, fat: 1.5, sat: 0, trans: 0, chol: 0, na: 190, carb: 30, fib: 3, sug: 10, add: 10, pro: 3 });
  assert.equal(f.s, "1 cup (30g)");
  assert.deepEqual(f.missing, []);
  assert.equal(f.src, "walmart");
  assert.match(f.ingredients, /^Whole Grain Oats/);
  assert.equal(V.assess(f, P).word, "In moderation");
});

test("Milk: abbreviated names (Sat. Fat, Cholest., Total Carb., Fiber) and added sugar nested under total sugars", () => {
  const f = W.plan(page("milk")).food;
  assert.deepEqual([f.sat, f.chol, f.carb, f.fib, f.add, f.pro], [3, 20, 12, 0, 0, 8]);
  assert.ok(!f.missing.includes("add"), "added sugar is reported (0 g), not missing");
  assert.equal(f.s, "1 cup (240mL)");
});

test("Oikos Pro: saturated fat nested under total fat", () => {
  const f = W.plan(page("oikos")).food;
  assert.deepEqual([f.fat, f.sat, f.trans, f.fib, f.sug, f.add, f.pro], [3, 2.5, 0, 0, 4, 0, 23]);
  assert.equal(V.assess(f, P).word, "Get it");
});

test("no panel but a real barcode → barcode lookup", () => {
  for (const [k, code] of [["peanut-butter", "078742370033"], ["coke", "049000028904"], ["chicken", "078742373942"]]) assert.deepEqual(W.plan(page(k)), { kind: "barcode", code }, k);
});

test("produce sticker codes are matched by name, never looked up as barcodes", () => {
  // Open Food Facts returns an unrelated snack for this PLU (000000940115), so a barcode lookup would be wrong.
  const p = page("banana"), pl = W.plan(p);
  assert.ok(W.isPlu(p.upc));
  assert.equal(pl.kind, "name");
  assert.equal(pl.query, "Bananas");
  assert.equal(W.byName(pl.query, FOODS).n, "Banana");
  assert.ok(W.isWeighed("020554000000") && !W.isWeighed("078742370033"));
});

test("amounts: units convert, '<1g' is half the bound, junk is ignored", () => {
  assert.deepEqual(W.amount("1.5g"), { v: 1.5, u: "g" });
  assert.deepEqual(W.amount("<1g"), { v: 0.5, u: "g" });
  assert.deepEqual(W.amount("Less than 1g"), { v: 0.5, u: "g" });
  assert.equal(W.amount("see label"), null);
  const p = { name: "Test", upc: "", category: ["Food"], ingredients: "", nutrition: { calorieInfo: { mainNutrient: { name: "Calories", amount: "90" } },
    keyNutrients: { values: [{ mainNutrient: { name: "Sodium", amount: "0.4g" } }, { mainNutrient: { name: "Total Fat", amount: "500mg" } }, { mainNutrient: { name: "Protein", amount: "<1g" } }] } } };
  const f = W.fromPanel(p);
  assert.deepEqual([f.cal, f.na, f.fat, f.pro], [90, 400, 0.5, 0.5]);
  assert.ok(f.missing.includes("sat") && f.missing.includes("add"), "nutrients not on the panel are missing, not zero");
});

test("non-food pages and empty panels get no verdict", () => {
  assert.equal(W.plan(null).kind, "none");
  assert.equal(W.plan({ name: "HDMI cable", upc: "012345678905", category: ["Electronics", "Cables"], ingredients: "", nutrition: null }).kind, "none");
  assert.equal(W.fromPanel({ name: "x", nutrition: { calorieInfo: null, keyNutrients: null } }), null);
  assert.equal(W.nextData("<html>no data</html>"), null);
});
