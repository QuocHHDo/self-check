#!/usr/bin/env node
// Prints every built-in food's verdict as CSV for eyeballing outliers:
//   node tests/verdict-dump.js > verdicts.csv
// Optional: --profile '{"cal":1850,"pro":140,"sat":13}' to use other goals.
const { FOODS, CATEGORIES } = require("../js/foods.js");
const V = require("../js/verdict.js");

const i = process.argv.indexOf("--profile");
const profile = { ...V.DEFAULT_PROFILE, ...(i > 0 ? JSON.parse(process.argv[i + 1]) : {}) };
const label = Object.fromEntries(CATEGORIES.map(c => [c.id, c.label]));
const csv = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const ICON = { pos: "+", neg: "-", warn: "!", note: "i" };

const rows = [["name", "category", "serving", "calories", "verdict", "score", "reasons"]];
for (const f of FOODS) {
  const a = V.assess(f, profile);
  rows.push([f.n, label[f.c] || f.c, f.s, Math.round(f.cal), a.word, a.score ?? "", a.reasons.map(r => `${ICON[r.k] || "?"} ${r.t}`).join(" | ")]);
}
process.stdout.write(rows.map(r => r.map(csv).join(",")).join("\n") + "\n");
