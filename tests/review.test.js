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
  assert.deepEqual([...d.missing].sort(), ["add", "sat", "sug"]);
  assert.equal(d.partial, true);
  assert.equal(V.missingNote(d), "Partial data: USDA didn't report saturated fat, total sugars or added sugar.");
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

// ---- 8. Try instead / Compare ----
const offNutella = require("./fixtures/off-nutella.json");
test("8: swaps come from the same category (hand-picked hints excepted) and list Get it first", () => {
  for (const f of FOODS) {
    const swaps = V.findSwaps(f, FOODS, P);
    const hints = V.SWAP_HINTS[f.n] || [];
    for (const s of swaps) assert.ok(s.food.c === f.c || hints.includes(s.food.n), `${f.n} -> ${s.food.n} crosses categories`);
    for (let i = 1; i < swaps.length; i++) assert.ok(V.RANK[swaps[i - 1].verdict.tier] >= V.RANK[swaps[i].verdict.tier], `${f.n}: swaps out of order`);
  }
});

test("8: lookups map to a category through Open Food Facts tags or the name; no match hides swaps", () => {
  const nut = S.fromOff("3017620422003", offNutella.product);
  assert.equal(V.swapCategory(nut, FOODS), "nuts");
  assert.ok(V.findSwaps(nut, FOODS, P).every(s => s.food.c === "nuts"));
  assert.equal(V.swapCategory({ n: "Kirkland protein bar", c: "lookup" }, FOODS), "protein");
  const unknown = { ...food("Instant ramen"), n: "Zorblax crunch", c: "lookup" };
  assert.equal(V.swapCategory(unknown, FOODS), null);
  assert.deepEqual(V.findSwaps(unknown, FOODS, P), []);
});

test("8: swap reasons use per-100-calorie amounts when servings differ, and skip tiny differences", () => {
  const d = V.swapDiffs(food("Croissant"), food("English muffin, whole wheat"));
  assert.equal(d.basis, "kcal");
  assert.ok(d.kinds.includes("Whole grain"));
  // Under 10% of the Daily Value is never offered as a reason.
  const floors = { sat: 2, add: 5, na: 230, pro: 5, fib: 2.8 };
  for (const f of FOODS) for (const s of V.findSwaps(f, FOODS, P)) {
    for (const b of V.swapDiffs(f, s.food).bits) {
      const m = b.match(/^([\d.]+) (g|mg) (?:less|more) (saturated fat|added sugar|sodium|protein|fiber)/);
      if (!m) continue;
      const k = { "saturated fat": "sat", "added sugar": "add", sodium: "na", protein: "pro", fiber: "fib" }[m[3]];
      assert.ok(Number(m[1]) >= floors[k] - 0.05, `${f.n} -> ${s.food.n}: "${b}" is under 10% DV`);
    }
  }
});

test("8: Compare highlights only meaningful differences", () => {
  assert.equal(V.meaningfulDiff("pro", 20, 21), false);   // 5% apart
  assert.equal(V.meaningfulDiff("sat", 0.2, 0.5), false); // relative but tiny (under 1 g)
  assert.equal(V.meaningfulDiff("na", 300, 500), true);
  assert.equal(V.meaningfulDiff("fib", 1, 4), true);
});

test("8: no positive reason below 10% of the Daily Value", () => {
  for (const f of FOODS) for (const r of V.assess(f, P).reasons) {
    if (r.k !== "pos") continue;
    if (/fiber/i.test(r.t) && !/Whole/.test(r.t)) assert.ok(f.fib >= 2.8, `${f.n}: "${r.t}"`);
    if (/protein/i.test(r.t)) assert.ok(f.pro >= 5, `${f.n}: "${r.t}"`);
  }
});

test("8: the calorie warning is relative to your day and says so", () => {
  const big = V.assess(food("Instant ramen"), { ...P, cal: 1500 }).reasons.find(r => /big share of your day/.test(r.t));
  assert.ok(big && /% of your 1,500\)/.test(big.t), "warning mentions the daily calories");
  for (const f of FOODS) {
    const has = V.assess(f, P).reasons.some(r => /big share of your day/.test(r.t));
    if (has) assert.ok(f.cal >= V.HEAVY_SHARE * P.cal, f.n);
  }
});

// ---- 9. Plates are judged as a meal ----
const plate = (...items) => V.combine(items.map(([n, mult]) => ({ food: food(n), mult: mult || 1 })));
test("9: a plate is scored against a third of the day, flags low protein and credits balance", () => {
  const good = V.assess(plate(["Chicken breast, grilled"], ["Brown rice"], ["Broccoli"]), P);
  assert.equal(good.word, "Get it");
  assert.ok(good.reasons.some(r => r.k === "pos" && /Balanced/.test(r.t)));
  assert.ok(good.reasons.some(r => /third of your/.test(r.t)));
  const low = V.assess(plate(["White rice"], ["Broccoli"]), P);
  assert.ok(low.reasons.some(r => r.k === "neg" && /Low protein for a meal/.test(r.t)));
  const junk = V.assess(plate(["Cheeseburger, fast food"], ["French fries"], ["Soda"]), P);
  assert.equal(junk.word, "Limit it");
  assert.ok(junk.reasons.some(r => /this meal's share/.test(r.t)));
});

test("9: the same food as a plate uses meal targets, not single-food rules", () => {
  // 1 cup of white rice alone is In moderation as a food; as a whole meal it's low in protein.
  const a = V.assess(plate(["White rice"]), P);
  assert.ok(a.meal);
  assert.ok(!a.reasons.some(r => /in one serving/.test(r.t)), "no single-serving wording on a plate");
});

test("9: label explainers say 'this meal' for a plate", () => {
  const pl = plate(["Chicken breast, grilled"], ["Brown rice"]);
  for (const k of ["cal", "sat", "na", "add", "pro"]) {
    const e = V.explain(k, pl, P);
    assert.ok(/this meal/.test(e.join(" ")) && !/this serving/.test(e.join(" ")), k);
  }
});

test("9: a plate of foods with missing data never claims Get it", () => {
  const durian = S.fromUsda(require("./fixtures/usda-durian.json"));
  const a = V.assess(V.combine([{ food: durian, mult: 3 }, { food: food("Chicken breast, grilled"), mult: 1 }, { food: food("Broccoli"), mult: 1 }]), P);
  assert.notEqual(a.word, "Get it");
  assert.ok(a.reasons.some(r => /don't report/.test(r.t)));
});

// ---- Round 2, item 2: added sugar is unknown unless the source reports it ----
test("r2-2: USDA records without nutrient 1235 have unknown added sugar, never 0", () => {
  const d = S.fromUsda(durianItem);
  assert.ok(d.missing.includes("add"), "durian: added sugar missing");
  const cookie = S.fromUsda({ fdcId: 9, description: "COOKIES, CHOCOLATE CHIP, COMMERCIALLY PREPARED", dataType: "SR Legacy", foodNutrients: [
    { nutrientId: 1008, unitName: "KCAL", value: 488 }, { nutrientId: 1003, unitName: "G", value: 5 }, { nutrientId: 1004, unitName: "G", value: 24 },
    { nutrientId: 1258, unitName: "G", value: 8 }, { nutrientId: 1005, unitName: "G", value: 64 }, { nutrientId: 2000, unitName: "G", value: 32 },
    { nutrientId: 1079, unitName: "G", value: 2 }, { nutrientId: 1093, unitName: "MG", value: 350 }] });
  assert.ok(cookie.missing.includes("add") && !cookie.addLikelyZero);
  const a = V.assess(cookie, P);
  assert.ok(!a.reasons.some(r => /added sugar:/i.test(r.t) && r.k === "neg"), "unknown added sugar isn't scored");
  const reported = S.fromUsda({ fdcId: 10, description: "X", foodNutrients: [{ nutrientId: 1008, unitName: "KCAL", value: 100 }, { nutrientId: 2000, unitName: "G", value: 10 }, { nutrientId: 1235, unitName: "G", value: 6 }] });
  assert.ok(!reported.missing.includes("add")); assert.equal(reported.add, 6);
});

test("r2-2: a raw USDA food with unknown added sugar can still be Get it", () => {
  const avo = S.fromUsda(require("./fixtures/usda-search.json").foods[0]);
  assert.ok(avo.missing.includes("add") && avo.addLikelyZero);
  assert.equal(V.assess(avo, P).word, "Get it");
});

test("r2-2: Open Food Facts without sugars, or without added sugars, leaves added sugar unknown", () => {
  const noSugars = S.fromOff("1", { product_name: "A", serving_size: "30 g", serving_quantity: 30, nutriments: { "energy-kcal_100g": 400, "fat_100g": 10, "added-sugars_100g": 5 } });
  assert.ok(noSugars.missing.includes("sug") && noSugars.missing.includes("add"), "no sugars → added unknown too");
  const noAdded = S.fromOff("2", { product_name: "B", serving_size: "30 g", serving_quantity: 30, nutriments: { "energy-kcal_100g": 400, "sugars_100g": 20 } });
  assert.ok(noAdded.missing.includes("add"));
  // Nutella's label lists added sugar per 100 g only; it's scaled to the 15 g serving instead of dropped.
  const nut = S.fromOff("3017620422003", { ...offNutella.product, nutriments: { ...offNutella.product.nutriments, "energy-kcal_serving": 80, "sugars_serving": 8.4, "added-sugars_100g": 52.13 } });
  assert.ok(!nut.missing.includes("add")); assert.equal(nut.add, 7.8);
});

test("r2-2: plates keep added sugar unknown when an item doesn't report it", () => {
  const d = S.fromUsda(durianItem);
  const pl = V.combine([{ food: d, mult: 1 }]);
  assert.ok(pl.missing.includes("add"));
  const mixed = V.combine([{ food: d, mult: 1 }, { food: food("Apple"), mult: 1 }]);
  assert.ok(mixed.atLeast.includes("add"));
});

// ---- Round 2, item 4: Try instead for lookups follows the source's own category ----
test("r2-4: Nutella (live Open Food Facts tags) swaps with nut butters, never crackers or popcorn", () => {
  const nut = S.fromOff("3017620422003", offNutella.product);
  const swaps = V.findSwaps(nut, FOODS, P).map(s => s.food.n);
  assert.ok(swaps.length > 0);
  for (const n of swaps) assert.ok(V.SWAP_GROUPS.spreads.foods.includes(n), `${n} isn't a spread`);
});

test("r2-4: Open Food Facts cereal and soda tags map to matching built-ins", () => {
  const base = { s: "1 serving", cal: 200, fat: 2, sat: 0.5, trans: 0, chol: 0, na: 200, carb: 44, fib: 1, sug: 16, add: 15, pro: 2, tags: [], missing: [] };
  const cereal = S.makeFood("Frosted Choco Bombs", "1 cup", base, { src: "off", categories: ["en:plant-based-foods", "en:breakfast-cereals"] });
  for (const s of V.findSwaps(cereal, FOODS, P)) assert.ok(V.SWAP_GROUPS.cereal.foods.includes(s.food.n), s.food.n);
  const soda = S.makeFood("Coca-Cola", "1 can (355 ml)", { ...base, cal: 140, carb: 39, sug: 39, add: 39, fib: 0 }, { src: "off", categories: ["en:beverages", "en:carbonated-drinks", "en:sodas"] });
  const ss = V.findSwaps(soda, FOODS, P).map(s => s.food.n);
  assert.ok(ss.includes("Sparkling water") || ss.includes("Diet soda"), ss.join(", "));
});

test("r2-4: USDA foodCategory picks the category; no confident match hides Try instead", () => {
  const usda = (desc, cat) => S.fromUsda({ fdcId: 1, description: desc, foodCategory: cat, foodNutrients: [
    { nutrientId: 1008, unitName: "KCAL", value: 480 }, { nutrientId: 1004, unitName: "G", value: 24 }, { nutrientId: 1258, unitName: "G", value: 10 },
    { nutrientId: 1005, unitName: "G", value: 62 }, { nutrientId: 2000, unitName: "G", value: 35 }, { nutrientId: 1003, unitName: "G", value: 5 }, { nutrientId: 1093, unitName: "MG", value: 300 }] });
  assert.equal(V.swapTarget(usda("COOKIES, SHORTBREAD", "Baked Products"), FOODS).cat, "snacks");
  assert.equal(V.swapTarget(usda("BREAD, WHITE, COMMERCIALLY PREPARED", "Baked Products"), FOODS).cat, "grains");
  const candy = usda("CANDIES, FUDGE", "Sweets");
  assert.ok(V.findSwaps(candy, FOODS, P).every(s => s.food.c === "snacks"));
  assert.equal(V.swapTarget(usda("Durian, raw", "Fruits and Fruit Juices"), FOODS).cat, "fruit");
  assert.equal(V.swapTarget(usda("Orange juice, raw", "Fruits and Fruit Juices"), FOODS).cat, "drinks");
  const unknown = S.makeFood("Zorblax crunch", "1 serving", { cal: 300, sat: 6, add: 20, sug: 20, carb: 40 }, { src: "off", categories: ["en:plant-based-foods"] });
  assert.equal(V.swapTarget(unknown, FOODS), null);
  assert.deepEqual(V.findSwaps(unknown, FOODS, P), []);
});

// ---- Unknown added sugar only holds back "Get it" when it could matter ----
test("missing added sugar can't block Get it when total sugars are too low to cost a point", () => {
  const mk = (sug, add) => S.settleAddedSugar(S.makeFood("Test", "2 oz (56 g)", { cal: 200, fat: 1, sat: 0, na: 0, carb: 42, fib: 3, sug, pro: 7 }, { missing: add === undefined ? ["add"] : [] }), add !== undefined, false);
  assert.equal(V.assess(mk(1), P).tier, "good", "1 g total sugar: even all added is under the first cutoff (7.5 g)");
  assert.equal(V.assess(mk(7), P).tier, "good");
  assert.equal(V.assess(mk(8), P).tier, "mid", "8 g could be 16% of the limit, so it still blocks");
  assert.match(texts(V.assess(mk(8), P)), /without added sugar/);
  assert.equal(V.assess(mk(1), { ...P, add: 0 }).tier, "mid", "a zero limit means any added sugar matters");
  const juice = S.settleAddedSugar(S.makeFood("Test juice", "8 fl oz", { cal: 110, sug: 22, carb: 26, pro: 2 }, { missing: ["add"] }), false, false);
  assert.notEqual(V.assess(juice, P).tier, "good");
});
