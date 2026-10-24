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

// ---- 2. Skip list uses substring matching ----
test("2: skip list matches whole words with simple plurals", () => {
  const p = { ...P, skip: "ramen, egg" };
  for (const n of ["Eggs", "Egg whites", "Breakfast sandwich, sausage and egg", "Instant ramen"]) assert.equal(V.assess(food(n), p).word, "Skip", n);
  for (const n of ["Eggplant", "Veggie burger", "Veggie straws", "Frozen mixed vegetables", "Frozen waffles"]) assert.notEqual(V.assess(food(n), p).word, "Skip", n);
});

test("2: plural terms and multi-word terms", () => {
  assert.equal(V.assess(food("Eggs"), { ...P, skip: "eggs" }).word, "Skip");
  assert.equal(V.assess(food("Egg whites"), { ...P, skip: "eggs" }).word, "Skip");
  assert.equal(V.assess(food("Ground beef 80/20"), { ...P, skip: "ground beef" }).word, "Skip");
  assert.notEqual(V.assess(food("Beef jerky"), { ...P, skip: "ground beef" }).word, "Skip");
  assert.equal(V.assess(food("Blueberries"), { ...P, skip: "blueberry" }).word, "Skip");
});

test("2: the reason names the matching word", () => {
  const a = V.assess(food("Breakfast sandwich, sausage and egg"), { ...P, skip: "egg" });
  assert.match(a.why, /includes “egg”/);
});

// ---- 3. "Mild food" setting overrides the verdict instead of flagging ----
test("3: mild preference flags spicy foods but keeps the nutrition verdict", () => {
  for (const n of ["Kimchi", "Jalapeño", "Sriracha", "Buffalo sauce", "Pepper jack cheese", "Sweet chili sauce"]) {
    const plain = V.assess(food(n), { ...P, mild: false }), mild = V.assess(food(n), { ...P, mild: true });
    assert.equal(mild.word, plain.word, n);
    assert.notEqual(mild.word, "Skip", n);
    assert.equal(mild.spicy, true, n);
    assert.ok(mild.reasons.some(r => r.k === "warn" && /Spicy/.test(r.t)), n);
  }
  assert.equal(V.assess(food("Broccoli"), { ...P, mild: true }).spicy, false);
});

test("3: only the explicit skip list produces Skip", () => {
  const p = { ...P, mild: true, skip: "" };
  for (const f of FOODS) assert.notEqual(V.assess(f, p).word, "Skip", f.n);
});
