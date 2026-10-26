const test = require("node:test");
const assert = require("node:assert/strict");
const SUP = require("../js/supplement.js");
const W = require("../js/walmart.js");
const { build, AUDIT } = require("./fixtures/walmart-compact.js");
const SUPPS = require("./fixtures/walmart-supplements.json").pages;
const page = k => W.product(build(SUPPS[k]));

test("a pre-workout with Supplement Facts lines gets the supplement view, with its numbers", () => {
  const p = page("labeled"), plan = W.plan(p);
  assert.equal(plan.kind, "supplement");
  const s = SUP.analyze({ name: p.name, rows: plan.rows, ingredients: p.ingredients, serving: plan.serving });
  assert.deepEqual(s.caffeine, { mg: 200, from: "label", share: 0.5 });
  assert.equal(s.sodium, 75);
  assert.equal(s.added, 0, "left off a Supplement Facts label means it rounds to zero");
  assert.equal(s.calories, 0);
  assert.equal(s.serving, "1 Scoop (13.2g)");
  assert.deepEqual(s.sweeteners, ["Sucralose"]);
  assert.deepEqual(s.actives.map(a => a.name), ["Vitamin B12 (as Methylcobalamin)", "L-Citrulline", "Beta-alanine", "L-Tyrosine", "Taurine", "Himalayan Pink Salt"]);
  assert.equal(s.reason, "200 mg caffeine");
  for (const n of SUP.notes(s)) assert.ok(n.short.split(/\s+/).length <= 12, n.short);
});

test("with the label only in a photo: caffeine from the name, nothing made up", () => {
  const p = page("photo"), plan = W.plan(p);
  assert.equal(plan.kind, "supplement");
  const s = SUP.analyze({ name: p.name, rows: plan.rows, ingredients: p.ingredients });
  assert.deepEqual(s.caffeine, { mg: 200, from: "name", share: 0.5 });
  assert.equal(s.sodium, null, "no label lines: sodium is unknown, not zero");
  assert.equal(s.added, null);
  assert.match(SUP.notes(s)[0].full, /comes from the product's name/);
});

test("supplement detection doesn't catch foods", () => {
  for (const k of Object.keys(AUDIT)) assert.notEqual(W.plan(W.product(build(AUDIT[k]))).kind, "supplement", k);
  assert.equal(SUP.isSupplement({ category: ["Food", "Beverages"], name: "Vitamin Water Zero Sugar XXX" }), false, "vitamin water is a drink");
  assert.equal(SUP.isSupplement({ category: ["Health", "Vitamins"], name: "Nature Made Vitamin D3 Softgels" }), true);
  assert.equal(SUP.isSupplement({ category: ["Food"], name: "Ghost Pre Workout, 30 servings" }), true);
  assert.equal(SUP.isSupplement({ category: ["Health", "Sports Nutrition"], name: "Protein Powder", hasNutritionFacts: true }), false, "a real Nutrition Facts panel keeps it a food");
  assert.equal(SUP.caffeine([], "Caffeine-Free Diet Coke", ""), null);
});
