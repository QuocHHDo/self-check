// Cheap meal ideas: every idea is a real "Get it" meal that meets the protein target, fits the budget, and uses
// only priced foods; the list is cheapest first and varied; skip list and mild preference are respected.
const test = require("node:test");
const assert = require("node:assert/strict");
const { FOODS } = require("../js/foods.js");
const V = require("../js/verdict.js");
const PR = require("../js/prices.js");
const M = require("../js/meals.js");

const P = V.DEFAULT_PROFILE;
const CASES = [[P, 2, 25], [P, 3, 33], [P, 5, 40], [{ ...P, cal: 1600, pro: 140 }, 4, 47]];

test("each idea is a Get it meal, meets the protein target, fits the budget, and every food has a price", () => {
  for (const [p, budget, protein] of CASES) {
    const list = M.ideas(FOODS, p, { budget, protein });
    assert.ok(list.length >= 3, `at least 3 ideas for $${budget} / ${protein} g (got ${list.length})`);
    for (const i of list) {
      const plate = V.combine(i.items);
      assert.equal(V.assessMeal(plate, p).tier, "good", i.items.map(x => x.food.n).join(" + "));
      assert.ok(plate.pro >= protein);
      assert.ok(plate.cal >= p.cal / 3 * 0.5, "not a 'light meal'");
      const cost = i.items.reduce((t, x) => t + PR.price({ ...x.food, mult: x.mult }).cost, 0);
      assert.ok(Math.abs(cost - i.cost) < 1e-9 && cost <= budget);
    }
  }
});

test("cheapest first, one idea per protein, each vegetable once", () => {
  const list = M.ideas(FOODS, P, { budget: 5, protein: 30, max: 10 });
  for (let k = 1; k < list.length; k++) assert.ok(list[k].cost >= list[k - 1].cost);
  const proteins = list.map(i => i.items[0].food.n), vegs = list.map(i => i.items[1].food.n);
  assert.equal(new Set(proteins).size, proteins.length);
  assert.equal(new Set(vegs).size, vegs.length);
  for (const i of list) assert.equal(i.items[1].food.c, "veg");
});

test("skip list and mild preference leave foods out", () => {
  const all = M.ideas(FOODS, P, { budget: 5, protein: 30 });
  const top = all[0].items[0].food.n;
  const skipped = M.ideas(FOODS, { ...P, skip: top }, { budget: 5, protein: 30 });
  assert.ok(!skipped.some(i => i.items.some(x => x.food.n === top)), `${top} is on the skip list`);
  const R = M.roles(FOODS, { ...P, mild: true });
  assert.ok(![...R.protein, ...R.produce, ...R.starch].some(f => (f.tags || []).includes("spicy")));
});

test("the user's own price for an unpriced food brings it into the ideas", () => {
  const salmon = FOODS.find(f => f.n === "Salmon");
  assert.ok(!PR.price(salmon), "Salmon has no typical price");
  const R = M.roles(FOODS, P, { Salmon: { serving: 0.5 } });
  assert.ok(R.protein.some(f => f.n === "Salmon"));
  const list = M.ideas(FOODS, P, { budget: 3, protein: 25, own: { Salmon: { serving: 0.5 } }, max: 20 });
  assert.ok(list.some(i => i.items[0].food.n === "Salmon"), "a cheap salmon price shows salmon ideas");
});

test("an impossible target returns no ideas rather than bad ones", () => {
  assert.deepEqual(M.ideas(FOODS, P, { budget: 0.5, protein: 60 }), []);
});
