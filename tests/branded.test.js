// USDA Branded Foods: barcode fallback for US packaged products (including Walmart's Great Value, Marketside, Equate).
// Fixtures are real FoodData Central records saved by eval/probe-branded.mjs.
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../js/sources.js");
const V = require("../js/verdict.js");
const A = require("../js/additives.js");
const { FOODS } = require("../js/foods.js");
const fx = require("./fixtures/usda-branded.json");
const P = V.DEFAULT_PROFILE;
const rec = upc => fx.foods.find(f => f.gtinUpc === upc);

test("UPC queries cover the forms FoodData Central stores (12, 14, 13 digits, UPC-E)", () => {
  // A scanner reads Great Value lemonade as EAN-13 0078742378213; USDA stores 078742378213.
  assert.equal(S.usdaUpcQueries("0078742378213")[0], "078742378213");
  assert.ok(S.usdaUpcQueries("016000275287").includes("00016000275287"), "Cheerios is stored with 14 digits");
  assert.equal(S.usdaUpcQueries("04963406")[0], "04963406", "8-digit UPC-E is tried as printed");
  assert.deepEqual(S.usdaUpcQueries(""), []);
  assert.match(S.usdaUpcUrl("078742378213", "k"), /dataType=Branded/);
});

test("only the record whose UPC is the barcode counts as a match", () => {
  assert.equal(S.matchUpc(fx.foods, "0078742378213").description, "GREAT VALUE, LEMONADE");
  assert.equal(S.matchUpc(fx.foods, "00028400335799").description.startsWith("DORITOS"), true);
  assert.equal(S.matchUpc(fx.foods, "078742378214"), null);
});

test("per-100 g Branded values are scaled back to the label's serving and match its printed values", () => {
  const lemonade = S.fromUsda(rec("078742378213"));
  assert.equal(lemonade.n, "Great Value, Lemonade");
  assert.equal(lemonade.s, "3 tbsp (50 g)");
  const label = fx.detail.labelNutrients; // the same product's label, from the detail endpoint
  assert.equal(lemonade.cal, label.calories.value);
  assert.equal(lemonade.carb, label.carbohydrates.value);
  assert.equal(lemonade.sug, label.sugars.value);
  assert.ok(lemonade.missing.includes("add"), "added sugar isn't on this label, so it's unknown");
  assert.equal(lemonade.dataType, "Branded"); assert.equal(lemonade.gtin, "078742378213"); assert.equal(lemonade.published, "2021-10-28");
  const chips = S.fromUsda(rec("028400335799"));
  assert.equal(chips.n, "Doritos, Tortilla Chips, Nacho Cheese", "repeated name part removed");
  assert.equal(chips.s, "1 oz (28 g)", "GDSN unit ONZ shown as oz");
  assert.deepEqual([chips.cal, chips.fat, chips.na], [140, 8, 210]);
  assert.match(chips.ingredients, /^Corn, vegetable oil/, "ALL CAPS ingredients in sentence case");
});

test("the detail endpoint (shared #usda- links) gives the same food", () => {
  const a = S.fromUsda(rec("078742378213")), b = S.fromUsda(fx.detail);
  assert.deepEqual([b.n, b.s, b.cal, b.sug], [a.n, a.s, a.cal, a.sug]);
});

test("additives are found in Branded ingredient text", () => {
  const chips = S.fromUsda(rec("028400335799"));
  const info = A.analyze(chips);
  assert.ok(info.fromText);
  const codes = info.items.map(a => a.code);
  for (const c of ["E621", "E129", "E102", "E110", "E330"]) assert.ok(codes.includes(c), `${c} in ${codes.join(", ")}`);
  assert.equal(A.analyze(S.fromUsda(rec("078742352077"))).items.length, 0, "black tea: no additives");
  // Everyday words aren't mistaken for additives: amaranth flour, paprika, caramel, niacin.
  assert.deepEqual(A.findInText("Amaranth flour, paprika, caramel, niacin, soy lecithin"), []);
  assert.deepEqual(A.findInText("Caramel color, Red 40, mono and diglycerides").sort(), ["en:e129", "en:e150a", "en:e471"]);
});

test("Branded categories pick sensible swaps; unknown categories hide them", () => {
  const swaps = f => V.findSwaps(f, FOODS, P).map(s => s.food.n);
  assert.ok(swaps(S.fromUsda(rec("078742378213"))).every(n => /soda|sparkling|electrolyte|kombucha/i.test(n)), "lemonade swaps like soda");
  assert.equal(V.swapTarget(S.fromUsda(rec("078742096810")), FOODS).cat, "nuts", "smoked almonds in 'Popcorn, Peanuts, Seeds' are nuts");
  assert.equal(V.swapTarget(S.fromUsda(rec("028400335799")), FOODS).cat, "snacks");
  assert.equal(V.swapTarget({ ...S.fromUsda(rec("028400335799")), foodCategory: "Baby Formula", n: "Zorblax" }, FOODS), null);
});
