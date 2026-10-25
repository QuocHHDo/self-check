// Backups and transfer links: round-trip, never carry the USDA key, and only restore checked values.
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../js/backup.js");

const STORE = {
  profile: { cal: 1850, pro: 140, sat: 13, na: 2300, add: 36, fib: 30, skip: "hummus", mild: true, usdaKey: "MY-KEY" },
  favorites: ["Salmon", "Eggs"], recents: ["Banana"], grocery: [{ n: "Eggs", done: false, qty: 2 }, { n: "Bacon", done: true }],
  plate: [{ n: "Chicken breast, grilled", mult: 1.5 }], myPrices: { Eggs: { unit: 3.29 }, Salmon: { serving: 2.5 } },
  lookups: [{ n: "Nutella", cal: 200, src: "off", additives: ["en:e322"], nova: 4, missing: [] }],
  learn: { asked: 12, correct: 9, streak: 3, missed: ["q1"] }, walmartOnly: true, mealBudget: 3, mealProtein: null,
};
const get = k => STORE[k];

test("pack holds every saved key except the USDA key", () => {
  const b = B.pack(get, new Date("2026-10-25T12:00:00Z"));
  assert.equal(b.app, "should-i-buy-it");
  assert.equal(b.saved, "2026-10-25T12:00:00.000Z");
  assert.equal(b.data.profile.usdaKey, undefined);
  assert.equal(STORE.profile.usdaKey, "MY-KEY", "packing doesn't change what's stored");
  assert.deepEqual(b.data.grocery, STORE.grocery);
  assert.ok(!("mealProtein" in b.data), "unset values are left out");
});

test("parse keeps a full backup intact and summarizes it", () => {
  const r = B.parse(JSON.stringify(B.pack(get)));
  assert.ok(r.ok);
  const { usdaKey, ...profile } = STORE.profile;
  assert.deepEqual(r.data.profile, profile);
  assert.deepEqual(r.data.myPrices, STORE.myPrices);
  assert.deepEqual(r.data.lookups, STORE.lookups);
  assert.deepEqual(B.summary(r.data), ["your goals", "2 favorites", "2 grocery items", "1 plate item", "2 prices of yours", "1 looked-up food", "1 recent food", "quiz progress (12 answered)"]);
});

test("transfer links round-trip, compressed and plain", async () => {
  const b = B.pack(get);
  const z = await B.encode(b);
  assert.match(z, /^z\.[A-Za-z0-9_-]+$/, "URL-safe");
  assert.deepEqual((await B.decode(z)).data, B.parse(b).data);
  const saved = global.CompressionStream;
  global.CompressionStream = undefined;
  try {
    const j = await B.encode(b);
    assert.match(j, /^j\./);
    assert.deepEqual((await B.decode(j)).data, B.parse(b).data);
  } finally { global.CompressionStream = saved; }
});

test("junk and hostile input are refused or cleaned", async () => {
  assert.equal(B.parse("not json").ok, false);
  assert.equal(B.parse({ app: "other", data: {} }).ok, false);
  assert.match(B.parse({ app: "should-i-buy-it", v: 99, data: { favorites: ["x"] } }).error, /newer version/);
  assert.match(B.parse({ app: "should-i-buy-it", v: 1, data: { profile: { cal: -5 }, favorites: [1, 2] } }).error, /empty/);
  const r = B.parse({ app: "should-i-buy-it", v: 1, data: {
    profile: { cal: 99999, pro: 150, usdaKey: "stolen?", extra: "x" },
    grocery: [{ n: "Eggs", qty: 1e9 }, { n: 42 }, null],
    plate: [{ n: "Eggs", mult: 500 }, { n: "Rice", mult: 1 }],
    myPrices: { Eggs: { unit: -3 }, Rice: { unit: 2 } },
    lookups: [{ n: "X", cal: 10, fn: { evil: true }, "<img>": "x", note: "a".repeat(6000), tags: ["ok"] }, { n: "No calories" }],
    unknownKey: [1, 2, 3],
  } });
  assert.ok(r.ok);
  assert.deepEqual(r.data.profile, { pro: 150 }, "out-of-range goals, unknown fields and a key are dropped");
  assert.deepEqual(r.data.grocery, [{ n: "Eggs", done: false }]);
  assert.deepEqual(r.data.plate, [{ n: "Rice", mult: 1 }]);
  assert.deepEqual(r.data.myPrices, { Rice: { unit: 2 } });
  assert.deepEqual(r.data.lookups, [{ n: "X", cal: 10, tags: ["ok"] }]);
  assert.ok(!("unknownKey" in r.data));
  assert.equal((await B.decode("z.not-a-real-link")).ok, false);
  assert.equal((await B.decode("x.abc")).ok, false);
});
