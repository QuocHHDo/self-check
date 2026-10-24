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
