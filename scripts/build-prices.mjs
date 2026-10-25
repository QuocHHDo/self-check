// Builds js/prices-data.js: a typical price per serving for built-in foods, from free government data.
//   node scripts/build-prices.mjs <raw-dir>
// <raw-dir> holds BLS files from https://download.bls.gov/pub/time.series/ (ap.item, ap.series, ap.data.3.Food,
// cu.data.11.USFoodBeverage). ERS Fruit and Vegetable Prices CSVs are read from data/prices/ (committed, yearly).
// The monthly "Update prices" workflow downloads the BLS files and runs this.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { PRICE_MAP } from "./price-map.mjs";

const require = createRequire(import.meta.url);
const { FOODS } = require("../js/foods.js");
const ROOT = new URL("..", import.meta.url).pathname;
const raw = process.argv[2];
if (!raw) { console.error("usage: node scripts/build-prices.mjs <dir with BLS ap.* and cu.* files>"); process.exit(1); }
const tsv = f => fs.readFileSync(path.join(raw, f), "utf8").split("\n").slice(1).filter(Boolean).map(l => l.split("\t").map(s => s.trim()));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---- BLS Average Price: latest month for each item, South (area 0300) and U.S. city average (0000) ----
const itemName = Object.fromEntries(tsv("ap.item").map(r => [r[0], r[1]]));
const latest = {}; // series id → { ym, v }
for (const [sid, year, period, value] of tsv("ap.data.3.Food")) {
  if (!/^M(0[1-9]|1[0-2])$/.test(period)) continue;
  const v = Number(value);
  if (!(v > 0)) continue;
  const ym = `${year}-${period.slice(1)}`;
  if (!latest[sid] || ym > latest[sid].ym) latest[sid] = { ym, v };
}
// Unit of each item: grams, millilitres or a count, read from its name ("per lb. (453.6 gm)", "per gal. (3.8 lit)").
function unitOf(name) {
  if (/per doz/i.test(name)) return { count: 12, label: "dozen" };
  const g = name.match(/\(([\d.]+) gm\)/i); if (g) return { g: Number(g[1]), label: /per lb/i.test(name) ? "lb" : name.match(/per ([\d./]+ oz)/i)?.[1] || `${g[1]} g` };
  if (/per lb/i.test(name)) return { g: 453.6, label: "lb" };
  const ml = name.match(/\(([\d.]+) ml\)/i); if (ml) return { ml: Number(ml[1]), label: name.match(/per ([\d./]+ oz)/i)?.[1] || "unit" };
  if (/per 1\/2 gal/i.test(name)) return { ml: 1892.7, label: "½ gal" };
  if (/per gal/i.test(name)) return { ml: 3785.4, label: "gal" };
  if (/per 2 liters/i.test(name)) return { ml: 2000, label: "2 L" };
  if (/per 1 liter/i.test(name)) return { ml: 1000, label: "liter" };
  if (/per 16 oz/i.test(name)) return { g: 453.6, ml: 473.2, label: "16 oz" };
  throw new Error("unknown unit: " + name);
}
function bls(code) {
  const south = latest[`APU0300${code}`], us = latest[`APU0000${code}`];
  if (!south && !us) return null;
  // Prefer the South series (closest to Texas) unless it's more than 6 months older than the national one.
  const age = (a, b) => (Number(a.slice(0, 4)) - Number(b.slice(0, 4))) * 12 + Number(a.slice(5)) - Number(b.slice(5));
  const pick = south && (!us || age(us.ym, south.ym) <= 6) ? { ...south, area: "South" } : { ...us, area: "U.S." };
  return { ...pick, name: itemName[code], unit: unitOf(itemName[code] || "") };
}

// ---- CPI: bring ERS's 2023 prices forward to the latest month, per category ----
const cpi = {};
for (const [sid, year, period, value] of tsv("cu.data.11.USFoodBeverage")) {
  if (!sid.startsWith("CUUR0000")) continue; // U.S., not seasonally adjusted
  const v = Number(value); if (!(v > 0) || !/^M(0[1-9]|1[0-2])$/.test(period)) continue;
  (cpi[sid.slice(8)] ||= []).push({ ym: `${year}-${period.slice(1)}`, v });
}
function cpiFactor(series) {
  const s = (cpi[series] || []).sort((a, b) => a.ym.localeCompare(b.ym));
  const base = s.filter(x => x.ym.startsWith("2023-"));
  if (!s.length || base.length < 12) return null;
  const avg = base.reduce((t, x) => t + x.v, 0) / base.length;
  return { factor: s[s.length - 1].v / avg, ym: s[s.length - 1].ym };
}
const FORM_CPI = { "Fresh|fruit": "SEFK", "Fresh|veg": "SEFL", Canned: "SEFM01", Frozen: "SEFM02", Dried: "SEFM03", Juice: "SEFN03" };

// ---- ERS Fruit and Vegetable Prices (2023): price per pound or pint, edible yield ----
const ers = {};
for (const file of ["ers-fruit-prices.csv", "ers-vegetable-prices.csv"]) {
  const lines = fs.readFileSync(path.join(ROOT, "data/prices", file), "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  const kind = file.includes("fruit") ? "fruit" : "veg";
  for (const line of lines.slice(1)) {
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(c => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
    const [name, form, price, unit, yieldF] = cells;
    if (!name || !(Number(price) > 0)) continue;
    ers[`${name}|${form}`] = { price: Number(price), pint: /pint/i.test(unit), yield: Number(yieldF) || 1, form, kind };
  }
}

// ---- One serving's cost ----
const servingAmount = s => { const all = [...String(s).matchAll(/(\d+(?:\.\d+)?)\s*(g|ml)\b/g)]; return all.length ? Number(all[all.length - 1][1]) : null; };
const out = {}, problems = [];
let blsMonth = "", cpiMonth = "";
for (const [food, spec] of Object.entries(PRICE_MAP)) {
  const f = FOODS.find(x => x.n === food);
  if (!f) { problems.push(`no built-in food named ${food}`); continue; }
  const amount = spec.buy ?? servingAmount(f.s);
  const e = spec.ers ? ers[spec.ers] : null;
  if (spec.ers && !e) { problems.push(`${food}: ERS row "${spec.ers}" not found`); continue; }
  let cost, unitPrice, unitLabel, src, when, region;
  if (spec.bls) {
    const b = bls(spec.bls);
    if (!b) { problems.push(`${food}: no BLS data for ${spec.bls}`); continue; }
    const yieldF = e && !spec.buy ? e.yield : 1; // edible share; a purchase amount (buy) is already as-bought
    if (b.unit.count) cost = b.v * (spec.n || 1) / b.unit.count;
    else if (b.unit.ml && (!b.unit.g || /ml/.test(f.s))) cost = b.v * amount / b.unit.ml;
    else cost = b.v * (amount / yieldF) / b.unit.g;
    unitPrice = b.v; unitLabel = b.unit.label; src = "bls"; when = b.ym; region = b.area;
    if (b.ym > blsMonth) blsMonth = b.ym;
  } else {
    const series = FORM_CPI[e.form === "Fresh" ? `Fresh|${e.kind}` : e.form];
    const adj = cpiFactor(series);
    if (!adj) { problems.push(`${food}: no CPI for ${series}`); continue; }
    const price = e.price * adj.factor;
    cost = e.pint ? price * amount / 473.2 : price / e.yield * amount / 453.6;
    unitPrice = price; unitLabel = e.pint ? "pint" : "lb"; src = "ers"; when = adj.ym; region = "U.S.";
    if (adj.ym > cpiMonth) cpiMonth = adj.ym;
  }
  if (!(amount > 0) && !spec.n) { problems.push(`${food}: no serving weight`); continue; }
  // The share of a priced unit one serving uses, so a price the user enters per unit converts exactly.
  out[food] = [Math.round(cost * 1000) / 1000, Math.round(unitPrice * 100) / 100, unitLabel, src, region, when, spec.approx || "", Number((cost / unitPrice).toPrecision(5))];
}
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
const label = ym => `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
const meta = { bls: blsMonth && label(blsMonth), ers: "2023", cpi: cpiMonth && label(cpiMonth), count: Object.keys(out).length };
const body = `// Generated by scripts/build-prices.mjs. Don't edit by hand.
// Typical U.S. prices, not a specific store's: BLS Average Price Data (South region when available, monthly) and
// USDA ERS Fruit and Vegetable Prices (2023) brought forward with the CPI for that food group.
// food → [cost per serving $, price per unit $, unit, source "bls"|"ers", region, "YYYY-MM", note, units per serving]
(function (root, data) {
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.SelfCheckPricesData = data;
})(typeof self !== "undefined" ? self : this, ${JSON.stringify({ meta, foods: out })});
`;
fs.writeFileSync(path.join(ROOT, "js/prices-data.js"), body);
console.log(`Wrote js/prices-data.js: ${meta.count} foods priced (BLS through ${meta.bls}, ERS 2023 adjusted to ${meta.cpi})`);
