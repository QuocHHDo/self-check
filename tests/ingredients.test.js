const test = require("node:test");
const assert = require("node:assert/strict");
const I = require("../js/ingredients.js");
const { data } = require("./fixtures/walmart-compact.js");
const W = require("../js/walmart.js");

// The label from a real Walmart page (Oct 25, 2026): Louisiana Fish Fry tartar sauce.
const TARTAR = "Water, Soybean Oil (Highly Refined), Dill Relish (Cucumber, Distilled Vinegar, Salt, Calcium Chloride, Xanthan Gum, Sodium Benzoate (Preservative <0.1%), Natural Flavors), Salt, Distilled Vinegar, High Fructose Corn Syrup, Egg Yolks, Modified Food Starch (Corn), Salt, Xanthan Gum, Dried Garlic, Dried Onion, Potassium Sorbate and Sodium Benzoate (Preservatives), Dried Parsley, Natural and Artificial Flavor, Calcium Disodium EDTA Added to Protect Flavor. Contains: Egg.";
const names = (r, key) => (r.groups.find(g => g.key === key) || { items: [] }).items.map(i => i.name);

test("tartar sauce: every ingredient lands in a plain group", () => {
  const r = I.analyze(TARTAR);
  assert.equal(r.contains, "Egg");
  assert.deepEqual(names(r, "food"), ["Dill Relish", "Egg Yolks", "Dried Garlic", "Dried Onion", "Dried Parsley"]);
  assert.deepEqual(names(r, "basic"), ["Water", "Salt", "Distilled Vinegar"]);
  assert.deepEqual(names(r, "sugar"), ["High Fructose Corn Syrup"]);
  assert.deepEqual(names(r, "fat"), ["Soybean Oil"]);
  assert.deepEqual(names(r, "refined"), ["Modified Food Starch"]);
  assert.deepEqual(names(r, "flavor"), ["Natural and Artificial Flavor"]);
  assert.deepEqual(names(r, "additive"), ["Xanthan Gum", "Potassium Sorbate", "Sodium Benzoate", "Calcium Disodium EDTA", "Calcium Chloride"]);
  const add = r.groups.find(g => g.key === "additive");
  assert.equal(add.items.find(i => i.name === "Xanthan Gum").pos, 10, "listed both in the relish and on its own: keeps its own place");
  assert.equal(add.items.find(i => i.name === "Calcium Chloride").inside, "Dill Relish");
  assert.ok(add.items.every(i => i.additive.status === "safe"));
  const fat = r.groups.find(g => g.key === "fat");
  assert.match(fat.detail, /Soybean Oil is the 2nd ingredient/);
  assert.match(fat.note, /unsaturated/);
  assert.equal(r.summary, "17 ingredients · 5 additives · 1 added sugar");
});

test("label quirks: and/or, section labels, 'made with' lists, footnotes, 2% or less, acronyms", () => {
  const get = k => I.analyze(W.product(data(k)).ingredients);
  const pizza = get("great value frozen pepperoni pizza");
  assert.ok(names(pizza, "food").includes("Pepperoni Made with Pork, Chicken, and Beef"));
  assert.ok(names(pizza, "additive").includes("BHA") && names(pizza, "additive").includes("Sodium Nitrite"));
  assert.ok(names(pizza, "refined").includes("Enriched Wheat Flour"), "the crust's flour is listed");
  const chips = get("lays classic potato chips");
  assert.deepEqual(names(chips, "basic"), ["Salt"], "“and Salt” is just Salt");
  const turkey = get("great value deli turkey");
  assert.ok(!JSON.stringify(turkey).includes("To Preserve"), "a footnote isn't an ingredient");
  assert.ok(turkey.groups.flatMap(g => g.items).filter(i => i.pos >= 3).every(i => i.minor), "after “2% or less of” every ingredient is minor");
  const pie = get("banquet chicken pot pie");
  assert.ok(!names(pie, "basic").some(n => /:/.test(n)) && !names(pie, "food").some(n => /^(Filling|Crust)/.test(n)), "“Filling:” and “Crust:” labels are dropped");
  const cr = get("great value saltine crackers");
  assert.ok(!names(cr, "grain").includes("Malted Barley Flour"), "malted barley flour isn't a whole grain");
  assert.ok(names(get("oreo cookies"), "additive").includes("Soy Lecithin") && names(get("oreo cookies"), "additive").includes("Leavening"));
  assert.deepEqual(names(get("monster energy zero ultra"), "stim").sort(), ["Caffeine", "Taurine"]);
  assert.match(get("mission flour tortillas").groups.find(g => g.key === "fat").note, /saturated/i);
  assert.ok(names(get("great value tilapia fillets"), "additive").includes("Carbon Monoxide"));
});

test("additives to know about are counted; single-ingredient foods stay simple", () => {
  const bacon = I.analyze(W.product(data("oscar mayer bacon")).ingredients);
  assert.ok(bacon.concern >= 1 && /to know about/.test(bacon.summary));
  assert.equal(bacon.groups.find(g => g.key === "additive").tone, "warn");
  const eggs = I.analyze("Eggs.");
  assert.equal(eggs.summary, "1 ingredient · no additives found");
  assert.equal(I.analyze(""), null);
  assert.equal(I.analyze("Partially hydrogenated soybean oil, sugar").groups.find(g => g.key === "fat").tone, "bad");
  const may = I.analyze("Peanuts, salt. May contain tree nuts.");
  assert.deepEqual(may.may, ["May contain tree nuts"]);
  assert.equal(I.analyze("Sugar, Contains 2% or Less of Salt. Contains: Milk, Soy and Wheat.").contains, "Milk, Soy, Wheat");
});
