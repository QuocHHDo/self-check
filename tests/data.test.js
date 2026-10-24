// Data integrity for the built-in food list.
const test = require("node:test");
const assert = require("node:assert/strict");
const { FOODS, CATEGORIES } = require("../js/foods.js");
const { NUM_KEYS, SWAP_HINTS } = require("../js/verdict.js");

const ALCOHOL = /beer|wine|liquor|seltzer|margarita/i;
const catIds = new Set(CATEGORIES.map(c => c.id));

test("every food has a name, serving, category and non-negative numbers", () => {
  for (const f of FOODS) {
    assert.ok(f.n && typeof f.n === "string", "missing name");
    assert.ok(f.s && typeof f.s === "string", `${f.n}: missing serving`);
    assert.ok(catIds.has(f.c), `${f.n}: unknown category ${f.c}`);
    for (const k of NUM_KEYS) assert.ok(Number.isFinite(f[k]) && f[k] >= 0, `${f.n}: bad ${k}=${f[k]}`);
  }
});

test("label sub-lines never exceed their parent line", () => {
  for (const f of FOODS) {
    assert.ok(f.sat <= f.fat + 0.01, `${f.n}: saturated fat > total fat`);
    assert.ok(f.trans <= f.fat + 0.01, `${f.n}: trans fat > total fat`);
    assert.ok(f.add <= f.sug + 0.01, `${f.n}: added sugar > total sugar`);
    assert.ok(f.sug <= f.carb + 0.01, `${f.n}: sugar > carbs`);
    assert.ok(f.fib <= f.carb + 0.01, `${f.n}: fiber > carbs`);
  }
});

test("calories roughly match protein, carbs and fat (4/4/9; fiber counted at 0 to 2 kcal/g)", () => {
  const off = [];
  for (const f of FOODS) {
    if (f.cal < 40 || ALCOHOL.test(f.n)) continue;
    const base = 4 * f.pro + 4 * (f.carb - f.fib) + 9 * f.fat;
    const lo = base, hi = base + 2 * f.fib;
    const gap = f.cal < lo ? (lo - f.cal) / f.cal : f.cal > hi ? (f.cal - hi) / f.cal : 0;
    if (gap > 0.3) off.push(`${f.n}: label ${f.cal}, macros ${Math.round(lo)}–${Math.round(hi)}`);
  }
  assert.deepEqual(off, []);
});

test("names and aliases are unique", () => {
  const seen = new Map();
  for (const f of FOODS) for (const name of [f.n, ...f.a]) {
    const k = name.toLowerCase();
    assert.ok(!seen.has(k) || seen.get(k) === f.n, `"${name}" is used by both ${seen.get(k)} and ${f.n}`);
    seen.set(k, f.n);
  }
});

test("tags are known values", () => {
  for (const f of FOODS) for (const t of f.tags) assert.ok(["processed", "spicy", "treat"].includes(t), `${f.n}: unknown tag ${t}`);
});

test("every swap hint points at a real food", () => {
  const names = new Set(FOODS.map(f => f.n));
  for (const [from, list] of Object.entries(SWAP_HINTS)) {
    assert.ok(names.has(from), `hint source missing: ${from}`);
    for (const to of list) assert.ok(names.has(to), `hint target missing: ${to} (from ${from})`);
  }
});

test("there are at least 300 foods across all categories", () => {
  assert.ok(FOODS.length >= 300);
  for (const c of CATEGORIES) assert.ok(FOODS.some(f => f.c === c.id), `empty category ${c.id}`);
});

test("slugs are unique, ASCII-only, and round-trip to the same food", () => {
  const { slug, legacySlug } = require("../js/verdict.js");
  const seen = new Map();
  for (const f of FOODS) {
    const s = slug(f.n);
    assert.match(s, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${f.n}: slug "${s}" isn't plain ASCII`);
    assert.ok(!seen.has(s), `${f.n} and ${seen.get(s)} share the slug ${s}`);
    seen.set(s, f.n);
  }
  for (const f of FOODS) assert.equal(FOODS.find(g => slug(g.n) === slug(f.n)).n, f.n, `${f.n} doesn't round-trip`);
  assert.equal(slug("Jalapeño"), "jalapeno");
  assert.equal(legacySlug("Jalapeño"), "jalape-o"); // old links keep working
  // No legacy slug collides with a different food's current slug.
  for (const f of FOODS) { const owner = seen.get(legacySlug(f.n)); assert.ok(!owner || owner === f.n, `legacy ${legacySlug(f.n)} points at ${owner}`); }
});
