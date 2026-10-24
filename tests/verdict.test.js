// Verdict rules, explanations, scaling and swaps.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { FOODS } = require("../js/foods.js");
const V = require("../js/verdict.js");

const food = n => { const f = FOODS.find(x => x.n === n); assert.ok(f, `no food ${n}`); return f; };
const P = V.DEFAULT_PROFILE;
const CUT = { cal: 1850, pro: 140, sat: 13, na: 2300, add: 36, fib: 30, skip: "hummus", mild: true };
const word = (n, p = P) => V.assess(food(n), p).word;

test("anchor foods land where general nutrition guidance puts them", () => {
  for (const p of [P, CUT]) {
    for (const n of ["Chicken breast, grilled", "Greek yogurt, plain nonfat", "Broccoli", "Spinach", "Salmon", "Lentils", "Oatmeal, rolled oats", "Apple"]) assert.equal(word(n, p), "Get it", n);
    for (const n of ["Ground beef 80/20", "Soda", "Bacon", "Hot dog, beef", "Glazed donut", "Instant ramen"]) assert.equal(word(n, p), "Limit it", n);
  }
});

test("skip list and mild preference override nutrition", () => {
  assert.equal(word("Hummus", CUT), "Skip");
  assert.notEqual(word("Hummus", P), "Skip");
  assert.equal(word("Sriracha", CUT), "Skip");
  assert.notEqual(word("Sriracha", { ...CUT, mild: false }), "Skip");
  assert.equal(word("Chicken breast, grilled", { ...P, skip: "chicken" }), "Skip");
});

test("dietary cholesterol alone does not sink a food", () => {
  assert.equal(word("Shrimp"), "Get it");
  const notes = V.assess(food("Shrimp"), P).reasons.filter(r => r.k === "note");
  assert.ok(notes.some(r => /cholesterol/i.test(r.t)));
});

test("tighter personal limits make borderline foods stricter, never looser", () => {
  const rank = { bad: 0, mid: 1, good: 2, skip: -1 };
  for (const f of FOODS) {
    const a = V.assess(f, { ...P, skip: "" }), b = V.assess(f, { ...P, sat: 13, add: 36, skip: "" });
    assert.ok(rank[b.tier] <= rank[a.tier], `${f.n} got looser under tighter limits`);
  }
});

test("every label line has an explanation", () => {
  for (const k of ["cal", "fat", "sat", "trans", "chol", "na", "carb", "fib", "sug", "add", "pro"]) {
    const e = V.explain(k, food("Avocado"), P);
    assert.ok(e && e[0] && ["more", "low", "ctx"].includes(e[1]), k);
  }
});

test("scale multiplies every amount and keeps the original intact", () => {
  const f = food("Eggs"), d = V.scale(f, 2);
  for (const k of V.NUM_KEYS) assert.equal(d[k], f[k] * 2);
  assert.equal(d.mult, 2);
  assert.equal(f.mult, undefined);
});

test("swaps are better than the original and prefer hand-picked options", () => {
  const swaps = V.findSwaps(food("Ground beef 80/20"), FOODS, P);
  assert.equal(swaps[0].food.n, "Ground beef 93/7");
  const rank = { bad: 0, mid: 1, good: 2 };
  for (const n of ["Ground beef 80/20", "Soda", "Ranch dressing", "Eggs", "Bagel, plain", "Croissant"]) {
    const base = V.assess(food(n), P);
    for (const s of V.findSwaps(food(n), FOODS, P)) assert.ok(rank[s.verdict.tier] > rank[base.tier], `${n} -> ${s.food.n}`);
  }
});

test("swaps never suggest alcohol for a non-alcoholic drink, or a drink for a solid food", () => {
  assert.ok(!V.findSwaps(food("Soda"), FOODS, P).some(s => /beer|wine|liquor|seltzer|margarita/i.test(s.food.n) && s.food.n !== "Sparkling water"));
  assert.ok(!V.findSwaps(food("Eggs"), FOODS, P).some(s => /milk/i.test(s.food.n)));
});

test("foods rated Get it have no swaps", () => {
  assert.deepEqual(V.findSwaps(food("Broccoli"), FOODS, P), []);
});

// Snapshot of every verdict under the default goals. If a rule or a food changes on purpose,
// run `npm run snapshot` and review the diff in tests/verdict-snapshot.json before committing.
test("verdicts match the reviewed snapshot", () => {
  const file = path.join(__dirname, "verdict-snapshot.json");
  const expected = JSON.parse(fs.readFileSync(file, "utf8"));
  const actual = Object.fromEntries(FOODS.map(f => [f.n, V.assess(f, P).word]));
  const changed = Object.keys({ ...expected, ...actual }).filter(n => expected[n] !== actual[n]).map(n => `${n}: ${expected[n]} -> ${actual[n]}`);
  assert.deepEqual(changed, [], "verdicts changed; run `npm run snapshot` if intended");
});
