// Typical prices: built from BLS and USDA ERS by scripts/build-prices.mjs.
const test = require("node:test");
const assert = require("node:assert/strict");
const PR = require("../js/prices.js");
const DATA = require("../js/prices-data.js");
const { FOODS } = require("../js/foods.js");
const V = require("../js/verdict.js");
const food = n => FOODS.find(f => f.n === n);

test("about a hundred foods have a dated, sourced price", () => {
  assert.ok(DATA.meta.count >= 100, `${DATA.meta.count} priced`);
  assert.match(DATA.meta.bls, /^[A-Z][a-z]{2} 20\d\d$/);
  for (const [n, d] of Object.entries(DATA.foods)) {
    assert.ok(food(n), `${n} isn't a built-in food`);
    assert.ok(d[0] > 0.002 && d[0] < 10, `${n}: $${d[0]} per serving is out of range`);
    assert.ok(["bls", "ers"].includes(d[3]) && /^20\d\d-\d\d$/.test(d[5]), `${n}: source/date`);
  }
});

test("conversions: eggs by the dozen, cooked rice from dry, milk by the gallon", () => {
  const eggs = DATA.foods["Eggs"], milk = DATA.foods["Whole milk"], rice = DATA.foods["White rice"];
  assert.ok(Math.abs(eggs[0] - eggs[1] / 12) < 0.002, "one egg = a twelfth of a dozen");
  assert.ok(Math.abs(milk[0] - milk[1] * 240 / 3785.4) < 0.002, "a cup of milk from the gallon price");
  assert.ok(Math.abs(rice[0] - rice[1] * 62 / 453.6) < 0.002, "a cup of cooked rice is about 62 g dry");
  // Edible yield: a banana costs more per edible gram than its per-pound price suggests.
  const ban = DATA.foods["Banana"];
  assert.ok(ban[0] > ban[1] * 118 / 453.6, "peel is paid for");
});

test("price scales with servings, and your own price replaces the typical one", () => {
  const eggs = food("Eggs");
  const typical = PR.price(eggs);
  assert.equal(PR.price({ ...eggs, mult: 2 }).cost.toFixed(4), (typical.cost * 2).toFixed(4));
  const mine = PR.price(eggs, { Eggs: { unit: 3.6 } });
  assert.ok(mine.mine && Math.abs(mine.cost - 0.3) < 0.0005, `$3.60 a dozen → 30¢ an egg (${mine.cost})`);
  assert.equal(PR.price(food("Hummus")), null, "no series for hummus");
  assert.equal(PR.price(food("Hummus"), { Hummus: { serving: 0.4 } }).cost, 0.4, "a price you enter per serving");
  assert.match(typical.source, /BLS average price, (South region|U\.S\. average), [A-Z][a-z]{2} 20\d\d/);
});

test("value: protein per dollar for protein foods, fiber per dollar for fiber foods, nothing otherwise", () => {
  const v = PR.value(food("Lentils"), PR.price(food("Lentils")));
  assert.equal(v.k, "pro"); assert.match(v.text, /^\d+ g protein per \$1$/);
  assert.equal(PR.value(food("Raspberries"), PR.price(food("Raspberries"))).k, "fib");
  assert.equal(PR.value(food("Soda"), PR.price(food("Soda"))), null);
});

test("a plate's cost adds up the priced items and counts the rest", () => {
  const c = PR.plateCost([{ food: food("Eggs"), mult: 2 }, { food: food("White bread"), mult: 1 }, { food: food("Hummus"), mult: 1 }]);
  assert.equal(c.priced, 2); assert.equal(c.missing, 1);
  assert.ok(Math.abs(c.total - (DATA.foods["Eggs"][0] * 2 + DATA.foods["White bread"][0])) < 1e-9);
});

test("prices never change a verdict", () => {
  const before = FOODS.map(f => V.assess(f, V.DEFAULT_PROFILE).word).join();
  PR.price(food("Eggs"), { Eggs: { unit: 99 } });
  assert.equal(FOODS.map(f => V.assess(f, V.DEFAULT_PROFILE).word).join(), before);
});
