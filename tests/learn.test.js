// Learn mode, per-100-calorie scoring and plate totals.
const test = require("node:test");
const assert = require("node:assert/strict");
const { FOODS } = require("../js/foods.js");
const V = require("../js/verdict.js");
const L = require("../js/learn.js");

const food = n => FOODS.find(f => f.n === n);
const P = V.DEFAULT_PROFILE;

test("quiz questions are valid and their answers match the data", () => {
  const r = L.seeded(42);
  for (let i = 0; i < 300; i++) {
    const q = L.makeQuestion(FOODS, P, r);
    assert.ok(q && q.prompt && q.options.length >= 2, "question shape");
    assert.equal(new Set(q.options).size, q.options.length, `duplicate options: ${q.options}`);
    assert.ok(q.answer >= 0 && q.answer < q.options.length, "answer index");
    if (q.type === "more") {
      const k = q.id.split(":")[1];
      const [a, b] = q.foods;
      assert.ok(Math.abs(a[k] - b[k]) > 0, "clear difference");
      assert.equal(q.answer, a[k] > b[k] ? 0 : 1);
    } else {
      assert.equal(q.options[q.answer], V.assess(q.foods[0], P).word);
    }
  }
});

test("both question types appear", () => {
  const r = L.seeded(7), types = new Set();
  for (let i = 0; i < 50; i++) types.add(L.makeQuestion(FOODS, P, r).type);
  assert.deepEqual([...types].sort(), ["more", "verdict"]);
});

test("a question can be rebuilt from its id for review", () => {
  const r = L.seeded(3);
  for (let i = 0; i < 40; i++) {
    const q = L.makeQuestion(FOODS, P, r);
    const back = L.fromId(q.id, FOODS, P);
    assert.equal(back.id, q.id); assert.equal(back.answer, q.answer); assert.deepEqual(back.options, q.options);
  }
});

test("missed questions come back after 3, then 8, then 20 questions, and clear when answered right", () => {
  const q = { id: "verdict:Avocado" };
  let s = L.recordAnswer({}, q, false);
  assert.equal(s.missed[0].due, 4);
  assert.equal(L.dueReview(s), null);
  for (let i = 0; i < 3; i++) s = L.recordAnswer(s, { id: "x" + i }, true);
  assert.equal(L.dueReview(s).id, q.id);
  s = L.recordAnswer(s, q, false);
  assert.equal(s.missed.find(m => m.id === q.id).due, s.asked + 8);
  s = L.recordAnswer(s, q, true);
  assert.equal(s.missed.length, 0);
  assert.equal(s.correct, 4); assert.equal(s.asked, 6); assert.equal(s.streak, 1);
});

test("per-100-calorie scoring measures nutrient density and leaves near-zero-calorie foods per serving", () => {
  const g = V.per100kcal(food("Broccoli"));
  assert.equal(Math.round(g.cal), 100);
  assert.equal(g.s, "100 calories");
  assert.equal(V.per100kcal(food("Sriracha")), null);
  assert.equal(V.health(food("Sriracha"), P, "kcal").scaled, false);
  assert.ok(V.health(food("Broccoli"), P, "kcal").score > V.health(food("White bread"), P, "kcal").score);
  assert.ok(V.health(food("Soda"), P, "kcal").score < 0);
});

test("a plate adds up its items at their servings and carries tags", () => {
  const items = [{ food: food("Flour tortilla"), mult: 1 }, { food: food("Chicken breast, grilled"), mult: 1 }, { food: food("Bacon"), mult: 0.5 }];
  const p = V.combine(items);
  assert.equal(p.c, "plate"); assert.equal(p.s, "3 items");
  assert.equal(p.cal, Math.round((146 + 187 + 129 * 0.5) * 10) / 10);
  assert.ok(p.tags.includes("processed"));
  assert.ok(["Get it", "In moderation", "Limit it"].includes(V.assess(p, P).word));
});
