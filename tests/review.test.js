// Regression checks for the October 2026 review (one block per numbered item).
const test = require("node:test");
const assert = require("node:assert/strict");
const { FOODS } = require("../js/foods.js");
const V = require("../js/verdict.js");
const S = require("../js/sources.js");
const durianItem = require("./fixtures/usda-durian.json");

const P = V.DEFAULT_PROFILE;
const food = n => { const f = FOODS.find(x => x.n === n); assert.ok(f, `no food ${n}`); return f; };
const texts = a => a.reasons.map(r => r.t).join(" | ");

// ---- 1. Missing nutrient data is shown and scored as 0 ----
test("1: USDA record missing sat fat and sugars marks them missing, not zero", () => {
  const d = S.fromUsda(durianItem);
  assert.deepEqual([...d.missing].sort(), ["sat", "sug"]);
  assert.equal(d.partial, true);
  assert.equal(V.missingNote(d), "Partial data: USDA didn't report saturated fat or total sugars.");
});

test("1: verdict skips missing nutrients, says so, and won't call partial data a Get it", () => {
  const d = S.fromUsda(durianItem);
  const a = V.assess(d, P);
  assert.notEqual(a.word, "Get it");
  assert.ok(a.reasons.some(r => r.k === "warn" && /saturated fat/.test(r.t)), texts(a));
  assert.ok(!/0 g saturated|saturated fat: 0/i.test(texts(a)), "no reason treats missing sat fat as 0");
});

test("1: plate totals with a missing component are lower bounds", () => {
  const d = S.fromUsda(durianItem);
  const plate = V.combine([{ food: d, mult: 1 }, { food: food("Chicken breast, grilled"), mult: 1 }]);
  assert.ok(plate.atLeast.includes("sat") && !plate.missing.includes("sat"));
  const a = V.assess(plate, P);
  assert.ok(a.reasons.some(r => r.k === "warn" && /minimum/.test(r.t)), texts(a));
  const onlyDurian = V.combine([{ food: d, mult: 1 }]);
  assert.ok(onlyDurian.missing.includes("sat"));
});

test("1: Open Food Facts nutrients the label omits are missing too", () => {
  const f = S.fromOff("123", { product_name: "Mystery bar", nutriments: { "energy-kcal_100g": 400, "fat_100g": 20, "carbohydrates_100g": 50, "proteins_100g": 5 } });
  for (const k of ["sat", "na", "sug", "fib"]) assert.ok(f.missing.includes(k), k);
  assert.equal(f.partial, true);
  assert.notEqual(V.assess(f, P).word, "Get it");
});

test("1: complete built-in foods are unaffected", () => {
  for (const f of FOODS) assert.equal(V.missingNote(f), null, f.n);
});
