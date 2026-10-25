// The extension on 41 real Walmart products (one per search across the store, captured Oct 25, 2026).
const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../js/walmart.js");
const V = require("../js/verdict.js");
const C = require("../js/card.js");
const { FOODS } = require("../js/foods.js");
const { AUDIT, data } = require("./fixtures/walmart-compact.js");
const P = V.DEFAULT_PROFILE;
const plan = k => W.plan(W.product(data(k)));

// What each product gets: the verdict from Walmart's own panel, or which other route it takes.
const EXPECT = {
  "frosted flakes": "In moderation", "great value oats and honey granola": "In moderation", "doritos nacho cheese": "In moderation",
  "lays classic potato chips": "In moderation", "great value saltine crackers": "In moderation", "oreo cookies": "Limit it",
  "nature valley oats n honey bars": "In moderation", "great value frozen pepperoni pizza": "Limit it", "banquet chicken pot pie": "Limit it",
  "lean cuisine": "In moderation", "great value frozen broccoli florets": "Get it", "great value orange juice": "In moderation",
  "great value large white eggs 12 count": "In moderation", "great value shredded mozzarella": "In moderation", "chobani greek yogurt": "Get it",
  "great value salted butter": "Limit it", "great value ground beef 80/20": "Limit it", "tyson chicken nuggets": "In moderation",
  "oscar mayer bacon": "Limit it", "great value deli turkey": "In moderation", "great value tilapia fillets": "Get it",
  "barilla spaghetti": "In moderation", "great value extra virgin olive oil": "In moderation", "heinz ketchup": "In moderation",
  "great value white bread": "In moderation", "mission flour tortillas": "In moderation",
  "gatorade lemon lime": "barcode", "bodyarmor sports drink": "barcode", "monster energy zero ultra": "barcode", "great value chunk light tuna": "barcode",
  "great value long grain white rice": "barcode", "campbells chicken noodle soup": "barcode", "great value black beans": "barcode",
  "jif creamy peanut butter": "barcode", "premier protein shake": "barcode", "quest protein bar": "barcode",
  "fresh broccoli crowns": "Broccoli", "fresh strawberries": "Strawberries", "russet potatoes 5 lb": "Potato, baked", "fresh hass avocado": "Avocado", "marketside baby carrots": "Carrots",
};

test("every captured product takes the expected route and gets the expected verdict", () => {
  assert.equal(Object.keys(AUDIT).length, 41);
  for (const k of Object.keys(AUDIT)) {
    const pl = plan(k);
    const got = pl.kind === "panel" ? V.assess(pl.food, P).word : pl.kind === "name" ? (W.byName(pl.query, FOODS) || {}).n : pl.kind;
    assert.equal(got, EXPECT[k], k);
  }
});

test("panels: the nutrients that decide a verdict are read, with real numbers", () => {
  for (const k of Object.keys(AUDIT)) {
    const pl = plan(k);
    if (pl.kind !== "panel") continue;
    const f = pl.food;
    for (const n of V.NUM_KEYS) assert.ok(Number.isFinite(f[n]) && f[n] >= 0, `${k}: ${n} = ${f[n]}`);
    for (const n of ["cal", "fat", "sat", "na", "carb", "pro"]) assert.ok(!f.missing.includes(n), `${k}: ${n} missing`);
    assert.match(f.s, /\d/, `${k}: serving "${f.s}"`);
  }
});

test("label shorthand: blank amounts from %DV, and lines a label may leave out", () => {
  assert.equal(plan("oreo cookies").food.fib, 0.6, "Dietary Fiber | (blank) | 2% → 2% of 28 g");
  const oj = plan("great value orange juice").food;
  assert.deepEqual([oj.sat, oj.trans, oj.missing.includes("sat")], [0, 0, false], "no fat line → no saturated or trans fat");
  const butter = plan("great value salted butter").food;
  assert.deepEqual([butter.fib, butter.sug, butter.add], [0, 0, 0], "0 g carbohydrate → no fiber or sugar");
  assert.equal(plan("barilla spaghetti").food.fib, 3, "Soluble/Insoluble Fiber under Dietary Fiber don't replace the total");
  assert.equal(plan("great value deli turkey").food.add, 0.5, "<1g is read as 0.5 g");
});

test("fresh produce: name first, barcode only as a fallback; recipes in the ingredients field are ignored", () => {
  for (const k of ["fresh broccoli crowns", "fresh strawberries", "russet potatoes 5 lb", "fresh hass avocado", "marketside baby carrots"]) assert.equal(plan(k).kind, "name", k);
  assert.equal(plan("fresh broccoli crowns").fallback, null, "an in-store weighed code (2…) is never looked up");
  assert.equal(plan("fresh strawberries").fallback, "071430007525");
  assert.equal(W.product(data("russet potatoes 5 lb")).ingredients, "", "the potato page's 'ingredients' are a recipe");
});

test("every card has a specific one-line reason", () => {
  for (const k of Object.keys(AUDIT)) {
    const pl = plan(k);
    if (pl.kind !== "panel") continue;
    const h = C.headline(pl.food, P);
    assert.ok(h && !/See the tradeoffs below/.test(h), `${k}: "${h}"`);
  }
});
