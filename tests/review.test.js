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

// ---- 4. Wrong reason text applied to the wrong foods ----
const has = (n, re) => V.assess(food(n), P).reasons.some(r => re.test(r.t));
test("4: 'healthy fats' reasons only for nuts, seeds, fatty fish, avocado, olives and oils", () => {
  for (const n of ["Cheese puffs", "French fries", "Chicken nuggets, frozen", "Fish sticks, frozen", "Ranch dressing", "Coleslaw", "Potato salad", "Orange chicken", "Blueberry muffin", "Caesar salad", "Chicken salad, deli", "Peanut butter sandwich crackers"]) {
    assert.ok(!has(n, /Healthy fats are still/), `${n}: calorie-dense healthy-fat note`);
    assert.ok(!has(n, /mostly the unsaturated/), `${n}: unsaturated-fat bonus`);
  }
  for (const n of ["Avocado", "Almonds", "Walnuts", "Salmon", "Extra virgin olive oil"]) assert.ok(has(n, /Healthy fats are still/), n);
  assert.ok(has("Almonds", /mostly the unsaturated/));
});

test("4: 'cooking fat' only for oils and sprays; 'food volume' only for low energy density", () => {
  assert.ok(!has("Mayonnaise", /cooking fat/));
  assert.ok(has("Canola oil", /cooking fat/));
  assert.ok(!has("Dried figs", /food volume/));
  assert.ok(has("Broccoli", /food volume/));
});

test("4: trans fat wording only claims a natural source for meat and dairy", () => {
  const f = { ...food("Ground beef 80/20") };
  assert.ok(V.assess(f, P).reasons.some(r => /naturally/.test(r.t)));
  const shortening = { ...food("Vegetable shortening"), trans: 1.5 };
  assert.ok(!V.assess(shortening, P).reasons.some(r => /naturally/.test(r.t)));
});

// ---- 5. Barcode products use per-100 g as "1 serving" ----
const nutella = require("./fixtures/off-nutella.json");
test("5: Open Food Facts per-100 g values are scaled to the package serving", () => {
  const f = S.fromOff(nutella.code, nutella.product);
  assert.equal(f.s, "15 g");
  assert.equal(f.cal, Math.round(539 * 0.15 * 10) / 10);
  assert.equal(f.sat, Math.round(10.6 * 0.15 * 10) / 10);
  assert.equal(f.na, Math.round(42.8 * 0.15 * 10) / 10);
  assert.equal(f.per100, false);
  const two = V.scale(f, 2);
  assert.equal(Math.round(two.cal), Math.round(539 * 0.3));
});

test("5: label's own per-serving values win; no serving size falls back to labeled per 100 g", () => {
  const withServing = S.fromOff("1", { product_name: "X", serving_size: "1 bar (40 g)", serving_quantity: 40, nutriments: { "energy-kcal_serving": 190, "energy-kcal_100g": 475, "fat_serving": 8, "proteins_serving": 10 } });
  assert.equal(withServing.cal, 190); assert.equal(withServing.s, "1 bar (40 g)");
  const none = S.fromOff("2", { product_name: "Y", nutriments: { "energy-kcal_100g": 400, "fat_100g": 10 } });
  assert.equal(none.cal, 400); assert.equal(none.s, "100 g (no serving size on file)"); assert.equal(none.per100, true);
  const fromText = S.fromOff("3", { product_name: "Z", serving_size: "2 cookies (28 g)", nutriments: { "energy-kcal_100g": 500 } });
  assert.equal(fromText.cal, 140);
});

// ---- 6. "In moderation" is the default when nothing stands out ----
test("6: every verdict for every built-in food has a reason that supports it", () => {
  const supportsNonGetIt = a => a.reasons.some(r => r.k === "neg" || (r.k === "warn" && !/^Spicy/.test(r.t)));
  for (const p of [P, { ...P, cal: 1850, pro: 140, sat: 13, add: 36, fib: 30, mild: true }]) {
    for (const f of FOODS) {
      const a = V.assess(f, p);
      assert.ok(!a.reasons.some(r => /Nothing stands out/.test(r.t)), `${f.n}: placeholder reason`);
      if (a.word === "In moderation" || a.word === "Limit it") assert.ok(supportsNonGetIt(a), `${f.n} is ${a.word} without a − or ! reason`);
      if (a.word === "Get it") assert.ok(a.reasons.some(r => r.k === "pos"), `${f.n} is Get it without a + reason`);
      if (a.word === "Fine") assert.ok(f.cal < V.NEGLIGIBLE_KCAL && a.reasons.some(r => r.k === "note" && /barely affects/.test(r.t)), `${f.n} is Fine without the negligible-impact reason`);
    }
  }
});

test("6: negligible foods with nothing to flag are Fine, not In moderation", () => {
  for (const n of ["Zero-calorie sweetener", "Allulose", "Erythritol", "Coffee, black", "Diet soda", "Balsamic vinegar", "Yellow mustard", "Cooking spray"]) assert.equal(V.assess(food(n), P).word, "Fine", n);
  for (const n of ["Sugar", "Ketchup", "Pickles"]) assert.equal(V.assess(food(n), P).word, "In moderation", n);
});

// ---- 7. Consistent thresholds: whole produce, whole grains, fiber density, treats ----
test("7: whole fruit is rated consistently (natural sugar isn't penalized)", () => {
  for (const n of ["Apple", "Banana", "Grapes", "Cherries", "Mango", "Pineapple", "Medjool dates"]) {
    const a = V.assess(food(n), P);
    assert.equal(a.word, "Get it", n);
    assert.ok(!a.reasons.some(r => r.k === "neg" && /sugar/i.test(r.t)), `${n}: penalized for natural sugar`);
  }
  for (const n of ["Orange juice", "Raisins", "Dried figs", "Fruit smoothie, bottled"]) assert.equal(V.assess(food(n), P).word, "In moderation", n);
});

test("7: honey and cookies get the same kind of verdict; whole grains beat refined", () => {
  assert.equal(V.assess(food("Honey"), P).word, "Limit it");
  assert.equal(V.assess(food("Chocolate chip cookies"), P).word, "Limit it");
  for (const n of ["Whole wheat bread", "Whole wheat pasta", "Brown rice"]) assert.equal(V.assess(food(n), P).word, "Get it", n);
  for (const n of ["White bread", "Pasta", "White rice"]) assert.equal(V.assess(food(n), P).word, "In moderation", n);
});

test("7: treat tag adds a penalty with its own reason; never on whole foods", () => {
  const cookie = V.assess(food("Chocolate chip cookies"), P);
  assert.ok(cookie.reasons.some(r => r.k === "neg" && /treat/i.test(r.t)));
  for (const f of FOODS) if (f.tags.includes("treat")) assert.ok(!["fruit", "veg"].includes(f.c) || /fries|tots|hash/i.test(f.n), `${f.n}: treat tag on produce`);
  const untagged = { ...food("Chocolate chip cookies"), tags: [] };
  assert.ok(V.assess(untagged, P).score > cookie.score);
});

test("7: dump script prints one CSV row per food", () => {
  const out = require("node:child_process").execFileSync(process.execPath, [require("node:path").join(__dirname, "verdict-dump.js")]).toString().trim().split("\n");
  assert.equal(out[0], "name,category,serving,calories,verdict,score,reasons");
  assert.equal(out.length, FOODS.length + 1);
});
