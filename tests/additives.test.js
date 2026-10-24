// Additives and processing level for scanned products.
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../js/additives.js");
const DATA = require("../js/additives-data.js");
const S = require("../js/sources.js");
const V = require("../js/verdict.js");
const { FOODS } = require("../js/foods.js");
const P = V.DEFAULT_PROFILE;
const off = n => { const x = require(`./fixtures/${n}.json`); return S.fromOff(x.code, x.product); };

test("additive names come from the Open Food Facts taxonomy, with US spelling", () => {
  assert.ok(Object.keys(DATA).length >= 500);
  assert.deepEqual([A.lookup("en:e322").name, A.lookup("en:e322").fn], ["Lecithins", "antioxidant, emulsifier"]);
  assert.equal(A.lookup("en:e322i").name, "Lecithins"); // sub-variant falls back to the base number
  assert.equal(A.lookup("en:e150d").fn, "color");
  assert.equal(A.lookup("en:e955").name, "Sucralose");
});

test("Open Food Facts additives, NOVA group and ingredients are read", () => {
  const cola = off("off-test-cola");
  assert.deepEqual(cola.additives.slice(0, 2), ["en:e150d", "en:e338"]);
  assert.equal(cola.nova, 4);
  assert.match(cola.ingredients, /^Carbonated water/);
  assert.match(S.offProductUrl("1"), /additives_tags,nova_group,ingredients_text/);
});

test("ordinary additives are listed without a flag; NOVA 4 is a note, not a score change", () => {
  const cola = off("off-test-cola");
  const info = A.analyze(cola);
  assert.equal(info.items.length, 6);
  assert.deepEqual(info.flagged, []);
  assert.ok(info.items.find(a => a.code === "E211").efsaHigh, "EFSA intake note comes from the taxonomy");
  const a = V.assess(cola, P), plain = V.assess({ ...cola, additives: undefined, nova: undefined, ingredients: undefined }, P);
  assert.equal(a.word, plain.word);
  assert.equal(a.score, plain.score);
  assert.ok(a.reasons.some(r => r.k === "note" && /Ultra-processed \(NOVA 4\)/.test(r.t)));
});

test("additives regulators removed are flagged with a source and keep a product from Get it or Fine", () => {
  const candy = off("off-test-candy");
  const info = A.analyze(candy);
  assert.deepEqual(info.flagged.map(a => a.code || a.key).sort(), ["E127", "E171", "pho"]);
  for (const a of info.flagged) assert.match(a.flag.src, /^https:\/\//);
  assert.equal(info.items.filter(a => a.base === "e322").length, 1, "E322i is listed once");
  const v = V.assess(candy, P);
  assert.equal(v.word, "In moderation");
  assert.ok(v.reasons.some(r => r.k === "warn" && /Titanium dioxide \(E171\): Banned as a food additive in the EU/.test(r.t)));
  assert.ok(v.reasons.some(r => r.k === "warn" && /Partially hydrogenated oil: /.test(r.t)));
  const without = V.assess({ ...candy, additives: [], ingredients: "Sugar alcohols." }, P);
  assert.equal(without.word, "Fine", "the same nutrition without those additives is Fine");
});

test("nitrites are flagged but don't change the verdict", () => {
  const ham = S.makeFood("Test Ham", "2 slices", { cal: 60, pro: 10, fat: 2, sat: 0.7, na: 300, carb: 1, sug: 1, add: 1 }, { src: "off", additives: ["en:e250", "en:e301"] });
  const v = V.assess(ham, P), plain = V.assess({ ...ham, additives: undefined }, P);
  assert.ok(v.reasons.some(r => /Sodium nitrite \(E250\): A curing salt/.test(r.t)));
  assert.equal(v.word, plain.word);
});

test("the skip list matches additives by name or E-number", () => {
  const cola = off("off-test-cola");
  for (const term of ["aspartame", "E951", "951", "acesulfame k"]) {
    const v = V.assess(cola, { ...P, skip: `ramen, ${term}` });
    assert.equal(v.word, "Skip", term);
    assert.match(v.why, /it contains (aspartame \(E951\)|acesulfame k \(E950\))/);
  }
  assert.notEqual(V.assess(cola, { ...P, skip: "sucralose" }).word, "Skip");
});

test("built-in and USDA foods have no additive data, so nothing changes for them", () => {
  for (const f of FOODS) assert.equal(A.analyze(f), null, f.n);
  assert.equal(A.analyze(S.fromUsda(require("./fixtures/usda-durian.json"))), null);
  assert.equal(A.analyze(off("off-nutella")).items.length, 0);
  assert.equal(A.analyze(off("off-nutella")).nova, 3);
});
