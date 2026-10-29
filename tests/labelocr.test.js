// js/labelocr.js: reading Nutrition Facts from OCR text, checked against real OCR output from label photos.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../js/labelocr.js");
const S = require("../js/sources.js");
const V = require("../js/verdict.js");
const FIX = require("./fixtures/label-ocr.json").labels;

const ok = (got, want) => got != null && Math.abs(got - want) <= Math.max(0.01, want * 0.02);
const PLAIN = new Set(["read", "dv"]); // shown without a "check it" mark

test("a clean label: every line, the serving, the %DV fix for a g read as 9, and OCR slips in units", () => {
  const r = L.parse(`Nutrition Facts
8 servings per container
Serving size 2/3 cup (55g)
Calories 230
Total Fat 8g 10%
Saturated Fat lg 5%
Trans Fat Og
Cholesterol Omg 0%
Sodium 160rng 7%
Total Carbohydrate 37g 13%
Dietary Fiber 49 14%
Total Sugars 12g
Includes 10g Added Sugars 20%
Protein 3g`);
  assert.deepEqual(r.values, { cal: 230, fat: 8, sat: 1, trans: 0, chol: 0, na: 160, carb: 37, fib: 4, sug: 12, add: 10, pro: 3 });
  assert.equal(r.how.fib, "fixed");
  assert.equal(r.servingGrams, 55);
  assert.equal(r.kind, "nutrition");
  assert.deepEqual(r.notes, []);
});

test("older labels: 'Calories from Fat', 'Less than 1g', 'Sugars' without 'Total', and the footnote's 2,000 ignored", () => {
  const r = L.parse("Cz' os 160 Calories from Fat 60\nTotal Fat 7g 11%\nDietary Fiber Less than 1g 3%\nSugars 14g\nProtein 1g\nCalories: 2,000 2,500\nTotal Fat Less than 65g 80g");
  assert.equal(r.values.cal, 160);
  assert.equal(r.values.fat, 7);
  assert.equal(r.values.fib, 0.5);
  assert.equal(r.values.sug, 14);
});

test("Saturated fat isn't read from 'Polyunsaturated Fat'; numbers run into their name are split", () => {
  const r = L.parse("Total Fat 7g 9%\nPolyunsaturated Fat 3.5g\nSodiumi70mg 7%\nCholesterolomg 0%\nProteinzg");
  assert.equal(r.values.sat, undefined);
  assert.equal(r.values.na, 170);
  assert.equal(r.values.chol, 0);
  assert.equal(r.values.pro, 2);
});

test("numbers that can't be true are marked, with a reason", () => {
  const r = L.parse("Calories 900\nTotal Fat 2g\nSaturated Fat 5g\nTotal Carbohydrate 20g\nTotal Sugars 25g\nProtein 3g");
  assert.equal(r.how.sat, "doubt");
  assert.equal(r.how.sug, "doubt");
  assert.equal(r.how.cal, "doubt");
  assert.ok(r.notes.some(n => /more than total fat/.test(n)) && r.notes.some(n => /add up to about 110 calories/.test(n)));
});

test("a label per 100 g says so", () => {
  assert.ok(L.parse("Amount per 100g\nCalories 97\nTotal Fat 0g\nSodium 720mg\nTotal Carbohydrate 24g").notes.some(n => /per 100 g/.test(n)));
});

test("Supplement Facts: rows with amounts, caffeine included", () => {
  const r = L.parse("Supplement Facts\nServing Size 1 Scoop (8.5 g)\nCalories 5\nSodium 115 mg 5%\nCaffeine (as Caffeine Anhydrous) 300 mg *\nL-Citrulline 6 g *");
  assert.equal(r.kind, "supplement");
  assert.deepEqual(r.rows.map(x => x.name + " " + x.amount), ["Sodium 115 mg", "Caffeine (as Caffeine Anhydrous) 300 mg", "L-Citrulline 6 g"]);
});

test("17 real label photos (Open Food Facts): what's read unmarked is right; doubtful reads are marked", () => {
  let right = 0, wrongPlain = 0, wrongMarked = 0, notRead = 0, total = 0;
  for (const [name, { truth, texts }] of Object.entries(FIX)) {
    const m = L.merge(texts.map(L.parse));
    for (const [k, want] of Object.entries(truth)) {
      total++;
      const got = m.values[k];
      if (got == null) notRead++;
      else if (ok(got, want)) right++;
      else if (PLAIN.has(m.how[k])) wrongPlain++;
      else wrongMarked++;
    }
  }
  // Measured Oct 26, 2026: 114 of 165 right, 7 wrong (6 of them marked), 44 not read.
  assert.ok(right >= 114, `right: ${right} of ${total}`);
  assert.ok(wrongPlain <= 1, `wrong and not marked: ${wrongPlain}`);
  assert.ok(right + wrongPlain + wrongMarked + notRead === total);
});

test("clear photos come out complete: Skippy, Honey Nut Cheerios, Quaker oats", () => {
  for (const name of ["skippy", "hncheerios", "quaker"]) {
    const { truth, texts } = FIX[name];
    const m = L.merge(texts.map(L.parse));
    for (const [k, want] of Object.entries(truth)) assert.ok(ok(m.values[k], want), `${name} ${k}: ${m.values[k]} vs ${want}`);
  }
});

test("a photo it can't read (bold condensed type in columns) gives little, not wrong numbers", () => {
  const m = L.merge(FIX.mac.texts.map(L.parse));
  const wrong = Object.entries(FIX.mac.truth).filter(([k, v]) => m.values[k] != null && !ok(m.values[k], v) && PLAIN.has(m.how[k]));
  assert.deepEqual(wrong, []);
});

test("checked numbers become a food: blanks stay unknown, 0 g fat means no saturated fat", () => {
  const f = L.toFood(S, "Kraft mac & cheese", "2.2 oz (62g)", { cal: 220, fat: 0, na: 530, carb: 43, pro: 8, sug: "", fib: "1" });
  assert.equal(f.src, "photo");
  assert.equal(f.sat, 0);
  assert.equal(f.fib, 1);
  assert.ok(f.missing.includes("sug") && f.missing.includes("add") && !f.missing.includes("sat"));
  assert.ok(V.assess(f, V.DEFAULT_PROFILE).tier);
});
