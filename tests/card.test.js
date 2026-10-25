// The extension card's wording and choices, on built-in foods and on real Walmart page data.
const test = require("node:test");
const assert = require("node:assert/strict");
const V = require("../js/verdict.js");
const C = require("../js/card.js");
const W = require("../js/walmart.js");
const { FOODS } = require("../js/foods.js");
const PAGES = require("./fixtures/walmart-pages.json").pages;
const P = V.DEFAULT_PROFILE;
const food = n => FOODS.find(f => f.n === n);
const panel = k => W.fromPanel(W.product(PAGES[k].props.pageProps.initialData.data));

test("headline: the strongest plus and minus, in the verdict's own terms", () => {
  assert.equal(C.headline(panel("cheerios"), P), "A good fiber source, but 20% of your added-sugar limit.");
  assert.equal(C.headline(panel("milk"), P), "Decent protein, but 15% of your saturated-fat limit.");
  assert.equal(C.headline(panel("oikos"), P), "High protein for the calories.");
  assert.equal(C.headline(food("Banana"), P), "A good fiber source and whole fruit.");
});

test("headline: Limit it leads with what's wrong", () => {
  assert.equal(C.headline(food("Bacon"), P), "Processed meat and 16% of your saturated-fat limit, despite decent protein.");
  assert.match(C.headline(food("Soda"), P), /^78% of your added-sugar limit/);
});

test("headline: when something else decided it, the verdict's own line", () => {
  assert.equal(C.headline(food("Banana"), { ...P, skip: "banana" }), V.assess(food("Banana"), { ...P, skip: "banana" }).why);
  const partial = { ...food("Chicken breast, grilled"), missing: ["na"] };
  assert.equal(C.headline(partial, P), "Looks good on what's known, but key data is missing.");
  assert.equal(C.headline(food("Coffee, black"), P), V.assess(food("Coffee, black"), P).why);
});

test("limit bars use the verdict's cutoffs and points", () => {
  const bars = C.limitBars(panel("milk"), P);
  assert.deepEqual(bars.map(b => [b.k, b.value, b.tone]), [["sat", "3 g · 15%", "warn"], ["na", "130 mg · 6%", "ok"], ["add", "0 g · 0%", "ok"]]);
  for (const b of bars) assert.ok(b.marks.every(m => m > 0 && m < 1) && b.fill >= 0 && b.fill <= 1);
  const ramen = C.limitBars(food("Instant ramen"), P);
  assert.deepEqual(ramen.map(b => b.tone), ["bad", "bad", "ok"]);
  const missing = C.limitBars({ ...food("Banana"), missing: ["add"] }, P).find(b => b.k === "add");
  assert.equal(missing.known, false);
  assert.equal(missing.value, "not listed");
});

test("reasons: the two that decided it first, the rest folded", () => {
  const a = V.assess(food("Avocado"), P);
  const r = C.reasons(a, [{ name: "Red 3", code: "E127", flag: { t: "Revoked by the FDA." } }]);
  assert.equal(r.top.length, 2);
  assert.ok(r.top.every(x => x.d));
  assert.ok(r.rest.some(x => /Red 3 \(E127\)/.test(x.t)), "additive flags go under more");
  const capped = C.reasons(V.assess({ ...food("Chicken breast, grilled"), missing: ["na"] }, P));
  assert.ok(capped.top.some(x => /^Can't rate it "Get it"/.test(x.t)), "a reason that capped the verdict stays visible");
});

test("swap: same kind of food, better verdict, and a Walmart search", () => {
  assert.equal(C.swap(panel("cheerios"), FOODS, P).food.n, "Toasted oat cereal, plain");
  assert.equal(C.swap(panel("cheerios"), FOODS, P).query, "toasted oat cereal");
  assert.equal(C.swap(food("Bacon"), FOODS, P).query, "roasted turkey breast");
  assert.equal(C.searchName("Peanut butter, natural"), "natural peanut butter");
  assert.equal(C.walmartSearch("natural peanut butter"), "https://www.walmart.com/search?q=natural%20peanut%20butter");
});
