// The USDA eval's pure parts, checked offline with the same fixtures as sources.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const { FOODS } = require("../js/foods.js");
const S = require("../js/sources.js");
const usda = require("./fixtures/usda-search.json");
const usda_ = usda;

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

test("Claude eval: production prompt, reply parsing and scoring work offline", async () => {
  const { askClaude, sampleFoods, buildClaudeReport } = await import("../eval/claude-vs-usda.mjs");
  const { compareFood, suggestions } = await import("../eval/compare-usda.mjs");
  const realFetch = global.fetch;
  let sent;
  global.fetch = async (url, init) => {
    sent = { url, init: { ...init, body: JSON.parse(init.body) } };
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: 'Sure.\n```json\n{"found":true,"name":"Avocado","serving":"1/2 medium (75 g)","cal":120,"fat":11,"sat":1.6,"trans":0,"chol":0,"na":5,"carb":6.4,"fib":5,"sug":0.5,"add":0,"pro":1.5,"spicy":false,"processedMeat":false}\n```' }] }) };
  };
  try {
    const c = await askClaude("avocado", { key: "test", model: "claude-sonnet-5-5" });
    assert.equal(sent.url, "https://api.anthropic.com/v1/messages");
    assert.equal(sent.init.headers["anthropic-version"], "2026-10-21");
    assert.equal(sent.init.body.messages[0].content, S.claudePrompt("avocado"));
    assert.ok(!("temperature" in sent.init.body), "the current API version rejects temperature");
    assert.equal(c.src, "claude"); assert.equal(c.cal, 120);
    const usda = S.fromUsda(usda_.foods[0]);
    const row = { name: "Avocado", claude: compareFood({ ...c, n: "Avocado" }, usda), builtIn: compareFood(FOODS.find(f => f.n === "Avocado"), usda) };
    const md = buildClaudeReport([row, { name: "Mystery", error: "no USDA result" }], "claude-sonnet-5-5");
    assert.match(md, /Median error by nutrient/); assert.match(md, /Not scored/);
    assert.deepEqual(suggestions([row.builtIn]), []);
  } finally { global.fetch = realFetch; }
  assert.equal(sampleFoods(FOODS, 10).length, 10);
  assert.equal(new Set(sampleFoods(FOODS, 10).map(f => f.c)).size > 3, true);
});

test("matcher rejects the wrong-food matches from the first real run and keeps the right ones", async () => {
  const { matchConfidence } = await import("../eval/compare-usda.mjs");
  const wrong = [["Broccoli", "Fried Broccoli"], ["Spinach", "Spinach, Creamed"], ["Zucchini", "Bread, Zucchini"], ["Walnuts", "Oil, Walnut"],
    ["Banana", "Bananas, Dehydrated, Or Banana Powder"], ["Green beans", "Green Bean Casserole"], ["Low-carb tortilla", "Alcoholic Beverage, Beer, Light, Low Carb"],
    ["Cashews", "Cashew Butter"], ["Shrimp", "Shrimp Cocktail"], ["Lentils", "Lentil Curry"], ["Artichoke hearts, canned", "Hearts Of Palm, Canned"],
    ["Skyr, plain nonfat", "Yogurt, Plain, Nonfat"], ["Yogurt, flavored low-fat", "Yogurt, Plain, Low Fat"], ["Lemonade", "Vodka And Lemonade"]];
  for (const [ours, theirs] of wrong) assert.ok(matchConfidence(ours, theirs) < 0.5, `${ours} vs ${theirs}: ${matchConfidence(ours, theirs)}`);
  const right = [["Tomato", "Tomatoes, Raw"], ["Strawberries", "Strawberries, Raw"], ["Kiwi", "Kiwi Fruit, Raw"], ["Medjool dates", "Dates, Medjool"],
    ["Extra virgin olive oil", "Oil, Olive, Extra Virgin"], ["Ground pork", "Pork, Ground"], ["Dried mango, sweetened", "Mango, Dried, Sweetened"]];
  for (const [ours, theirs] of right) assert.ok(matchConfidence(ours, theirs) >= 0.5, `${ours} vs ${theirs}: ${matchConfidence(ours, theirs)}`);
});

test("ranking prefers raw basic records for produce and cooked records for cooked servings", async () => {
  const { rankCandidates } = await import("../eval/compare-usda.mjs");
  const broccoli = FOODS.find(f => f.n === "Broccoli");
  const best = rankCandidates(broccoli, [{ description: "Fried Broccoli", dataType: "Survey (FNDDS)" }, { description: "Broccoli, cooked", dataType: "Survey (FNDDS)" }, { description: "Broccoli, raw", dataType: "SR Legacy" }])[0];
  assert.equal(best.item.description, "Broccoli, raw");
  const farro = FOODS.find(f => f.n === "Farro");
  assert.equal(rankCandidates(farro, [{ description: "Farro, Pearled, Dry, Raw", dataType: "Foundation" }, { description: "Farro, cooked", dataType: "Survey (FNDDS)" }])[0].item.description, "Farro, cooked");
});

test("nutrients a USDA record leaves out are unknown, not zero", async () => {
  const { compareFood } = await import("../eval/compare-usda.mjs");
  const oil = S.fromUsda({ fdcId: 1, description: "Oil, olive, extra virgin", dataType: "Foundation", foodNutrients: [{ nutrientId: 1085, unitName: "G", value: 100 }, { nutrientId: 1258, unitName: "G", value: 13.8 }] });
  assert.ok(oil.missing.includes("na") && oil.missing.includes("pro"));
  assert.equal(oil.fat, 100);
  const r = compareFood(FOODS.find(f => f.n === "Extra virgin olive oil"), oil);
  assert.equal(r.errors.na, null);
  assert.ok(r.errors.fat < 0.1, `fat error ${r.errors.fat}`);
  const est = S.fromUsda({ fdcId: 2, description: "X", foodNutrients: [{ nutrientId: 1003, unitName: "G", value: 10 }, { nutrientId: 1004, unitName: "G", value: 5 }, { nutrientId: 1005, unitName: "G", value: 20 }] });
  assert.equal(est.cal, 165); assert.equal(est.calEstimated, true);
});
