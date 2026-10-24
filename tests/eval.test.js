// The USDA eval's pure parts, checked offline with the same fixtures as sources.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const { FOODS } = require("../js/foods.js");
const S = require("../js/sources.js");
const usda = require("./fixtures/usda-search.json");

test("eval: gram weights are read from serving text", async () => {
  const { servingGrams } = await import("../eval/compare-usda.mjs");
  assert.equal(servingGrams("4 oz cooked (113 g)"), 113);
  assert.equal(servingGrams("1 medium ear (90 g kernels)"), 90);
  assert.equal(servingGrams("12 fl oz can (355 ml)"), 355);
  assert.equal(servingGrams("1 serving"), null);
  const missing = FOODS.filter(f => servingGrams(f.s) == null).map(f => f.n);
  assert.deepEqual(missing, [], "every built-in serving should state its grams so the eval can scale USDA values");
});

test("eval: avocado matches USDA closely and keeps its verdict", async () => {
  const { compareFood } = await import("../eval/compare-usda.mjs");
  const r = compareFood(FOODS.find(f => f.n === "Avocado"), S.fromUsda(usda.foods[0]));
  assert.equal(r.grams, 75);
  assert.ok(r.errors.cal < 0.05, `calorie error ${r.errors.cal}`);
  assert.ok(r.confidence >= 0.5);
  assert.equal(r.verdictBuilt, r.verdictUsda);
});

test("eval: report renders with summary tables", async () => {
  const { compareFood, buildReport } = await import("../eval/compare-usda.mjs");
  const r = compareFood(FOODS.find(f => f.n === "Avocado"), S.fromUsda(usda.foods[0]));
  const md = buildReport([r], [{ name: "X", reason: "no USDA result" }]);
  assert.match(md, /Accuracy by nutrient/);
  assert.match(md, /Verdict agreement/);
  assert.match(md, /Skipped/);
});
