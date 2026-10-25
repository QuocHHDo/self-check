// The "What decided it" chart must agree with the verdict: its points add up to the score, and each bar's
// points match where the bar sits against its tick marks.
const test = require("node:test");
const assert = require("node:assert/strict");
const { FOODS } = require("../js/foods.js");
const V = require("../js/verdict.js");

const P = V.DEFAULT_PROFILE;
const PROFILES = [P, { ...P, cal: 1600, pro: 140, sat: 13, na: 1500, add: 25, fib: 38 }];
const food = n => { const f = FOODS.find(x => x.n === n); assert.ok(f, `no food ${n}`); return f; };
const total = b => b.rows.reduce((t, r) => t + r.points, 0) + b.other.reduce((t, o) => t + o.points, 0);
const tickPoints = r => r.v >= r.marks[1] ? -2 : r.v >= r.marks[0] ? -1 : 0;

test("chart points add up to the verdict score, for every food and two profiles", () => {
  for (const p of PROFILES) for (const f of FOODS) {
    const b = V.breakdown(f, p), a = V.assess(f, p);
    if (a.score == null) { assert.equal(b, null); continue; }
    assert.equal(total(b), a.score, `${f.n}: chart ${total(b)} vs score ${a.score}`);
    assert.equal(b.tier, a.tier);
    assert.equal(!!b.override, b.tier !== b.byScore, `${f.n}: an override is explained exactly when it applies`);
  }
});

test("limit bars: points match the tick marks they pass", () => {
  for (const p of PROFILES) for (const f of FOODS) {
    const b = V.breakdown(f, p);
    if (!b) continue;
    for (const r of b.rows.filter(r => r.kind === "limit" && r.known)) assert.equal(r.points, tickPoints(r), `${f.n} ${r.k}: ${r.v}`);
  }
});

test("protein bar is share of calories; credit needs the tick and at least 5 g", () => {
  for (const f of FOODS) {
    const r = V.breakdown(f, P).rows.find(x => x.k === "pro");
    const want = f.pro >= V.POS_FLOOR.pro ? (r.v >= r.marks[1] ? 2 : r.v >= r.marks[0] ? 1 : 0) : 0;
    assert.equal(r.points, want, f.n);
  }
  const chicken = V.breakdown(food("Chicken breast, grilled"), P).rows.find(x => x.k === "pro");
  const beef = V.breakdown(food("Ground beef 80/20"), P).rows.find(x => x.k === "pro");
  assert.ok(chicken.v > beef.v, "grilled chicken gets more of its calories from protein than 80/20 beef");
});

test("sodium uses its own cutoffs (20% / 35%), not saturated fat's", () => {
  assert.deepEqual(V.breakdown(food("Eggs"), P).rows.find(r => r.k === "na").marks, [0.2, 0.35]);
  assert.deepEqual(V.breakdown(food("Eggs"), P).rows.find(r => r.k === "sat").marks, [0.15, 0.3]);
});

test("non-nutrient reasons show as other factors with their points", () => {
  const broc = V.breakdown(food("Broccoli"), P);
  assert.ok(broc.other.some(o => o.label === "Whole vegetable" && o.points === 2));
  const bacon = V.breakdown(food("Bacon"), P);
  assert.ok(bacon.other.some(o => o.label === "Processed meat" && o.points === -2));
});

test("plates use the meal cutoffs and add up too", () => {
  const plate = V.combine([{ food: food("Chicken breast, grilled"), mult: 1 }, { food: food("Broccoli"), mult: 1 }, { food: food("White rice"), mult: 1 }]);
  const b = V.breakdown(plate, P);
  assert.equal(total(b), V.assess(plate, P).score);
  assert.ok(b.meal);
  const sat = b.rows.find(r => r.k === "sat");
  assert.deepEqual(sat.marks.map(m => Math.round(m * 1000) / 1000), [0.233, 0.333]);
});

test("missing data and tiny servings explain why the score didn't decide", () => {
  const partial = { ...food("Chicken breast, grilled"), missing: ["na"] };
  const b = V.breakdown(partial, P);
  assert.equal(b.rows.find(r => r.k === "na").known, false);
  assert.equal(b.byScore, "good");
  assert.equal(b.tier, "mid");
  assert.match(b.override, /key data is missing/);
  const coffee = V.breakdown(food("Coffee, black"), P);
  assert.equal(coffee.tier, "fine");
  assert.equal(coffee.byScore, "fine");
  assert.equal(coffee.override, "");
  assert.match(coffee.note, /Under 25 calories/);
});

test("a meal over its share of a limit can't be Get it, and the chart says why", () => {
  // 2 servings of 80/20 beef: 17.4 g saturated fat, 87% of the daily limit in one meal. It used to score +2 → Get it.
  const plate = V.combine([{ food: food("Ground beef 80/20"), mult: 2 }, { food: food("Carrots"), mult: 1 }, { food: food("Whole wheat bread"), mult: 1 }]);
  const a = V.assessMeal(plate, P);
  assert.equal(a.score, 2, "the score itself is unchanged");
  assert.equal(a.tier, "mid");
  assert.ok(a.reasons.some(r => r.k === "warn" && /over this meal's share of saturated fat/.test(r.t)));
  const b = V.breakdown(plate, P);
  assert.equal(b.byScore, "good");
  assert.match(b.override, /over this meal's share of saturated fat/);
  // A meal under every share still can be.
  const lean = V.combine([{ food: food("Chicken breast, grilled"), mult: 1 }, { food: food("Broccoli"), mult: 1 }, { food: food("Brown rice"), mult: 1 }]);
  assert.equal(V.assessMeal(lean, P).tier, "good");
});
