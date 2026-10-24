// Search: typo tolerance (item 12) and never silently substituting a different food (item 13).
const test = require("node:test");
const assert = require("node:assert/strict");
const Q = require("../js/search.js");
const { FOODS } = require("../js/foods.js");

test("12: typos still find the food, offered as 'Did you mean'", () => {
  const r = Q.resolve("chiken brest", FOODS);
  assert.equal(r.kind, "choose");
  assert.equal(r.typo, true);
  assert.equal(r.near[0].n, "Chicken breast, grilled");
  for (const [typed, want] of [["avacado", "Avocado"], ["bananna", "Banana"], ["strawbery", "Strawberries"], ["salmn", "Salmon"], ["grek yogurt", "Greek yogurt, plain nonfat"]]) {
    const near = Q.resolve(typed, FOODS).near.map(f => f.n);
    assert.ok(near.includes(want), `${typed} → ${near.join(", ")}`);
  }
});

test("12: typo matching doesn't invent matches for short or unrelated words", () => {
  assert.deepEqual(Q.resolve("xyz", FOODS).near, []);
  assert.deepEqual(Q.resolve("durian", FOODS).near, []);
  assert.equal(Q.editDistance("chiken", "chicken"), 1);
  assert.equal(Q.editDistance("brest", "breast"), 1);
  assert.equal(Q.editDistance("form", "from"), 1); // adjacent swap counts as one edit
});

test("12: exact names, aliases and single strong matches still open directly", () => {
  for (const [typed, want] of [["Avocado", "Avocado"], ["chicken breast", "Chicken breast, grilled"], ["80/20", "Ground beef 80/20"], ["oatmeal", "Oatmeal, rolled oats"]]) {
    const r = Q.resolve(typed, FOODS);
    assert.equal(r.kind, "open", typed); assert.equal(r.food.n, want, typed);
  }
});

