#!/usr/bin/env node
// Accuracy eval: compares the built-in nutrition values (written by Claude from general
// knowledge) with USDA FoodData Central, nutrient by nutrient and verdict by verdict.
//
//   USDA_API_KEY=your_key npm run eval
//
// Writes eval/report.md and eval/results.json. To pin a food to a specific USDA record
// (when the top search result is the wrong food), add it to eval/usda-map.json as
// { "Food name": fdcId }.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { FOODS } = require("../js/foods.js");
const V = require("../js/verdict.js");
const S = require("../js/sources.js");
const HERE = path.dirname(fileURLToPath(import.meta.url));

// Nutrients compared, with an absolute floor so tiny amounts don't produce huge percentages.
export const COMPARED = [["cal", 20, "Calories"], ["pro", 2, "Protein"], ["fat", 2, "Total fat"], ["sat", 1, "Saturated fat"],
  ["carb", 2, "Carbs"], ["fib", 1, "Fiber"], ["sug", 1, "Sugars"], ["na", 50, "Sodium"]];

// Grams (or ml, treated as grams) in a serving string like "4 oz cooked (113 g)".
export function servingGrams(s) {
  const all = [...String(s).matchAll(/(\d+(?:\.\d+)?)\s*(g|ml)\b/g)];
  return all.length ? Number(all[all.length - 1][1]) : null;
}

const tokens = s => String(s).toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2);
export function matchConfidence(name, description) {
  const want = tokens(name), have = new Set(tokens(description).map(w => w.replace(/s$/, "")));
  if (!want.length) return 0;
  return want.filter(w => have.has(w.replace(/s$/, ""))).length / want.length;
}

// Compare one built-in food with one USDA record (per 100 g).
export function compareFood(f, usdaFood) {
  const grams = servingGrams(f.s);
  if (!grams) return null;
  const u = V.scale(usdaFood, grams / 100);
  const errors = {};
  for (const [k, floor] of COMPARED) errors[k] = Math.abs(f[k] - u[k]) / Math.max(u[k], floor);
  // For the verdict, use USDA's numbers where it has them; USDA rarely reports added sugar, so keep ours.
  const asUsda = { ...f };
  for (const [k] of COMPARED) asUsda[k] = u[k];
  if (u.trans > 0) asUsda.trans = u.trans;
  if (u.chol > 0) asUsda.chol = u.chol;
  asUsda.add = Math.min(f.add, asUsda.sug);
  const p = { ...V.DEFAULT_PROFILE };
  return {
    name: f.n, serving: f.s, grams, usdaName: usdaFood.n, fdcId: usdaFood.fdcId,
    confidence: matchConfidence(f.n, usdaFood.n),
    built: Object.fromEntries(COMPARED.map(([k]) => [k, f[k]])),
    usda: Object.fromEntries(COMPARED.map(([k]) => [k, Math.round(u[k] * 10) / 10])),
    errors, maxError: Math.max(...Object.values(errors)),
    verdictBuilt: V.assess(f, p).word, verdictUsda: V.assess(asUsda, p).word,
  };
}

const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN; };
const pctf = x => `${Math.round(x * 100)}%`;

export function buildReport(results, skipped) {
  const confident = results.filter(r => r.confidence >= 0.5);
  const lines = [];
  lines.push("# Built-in nutrition values vs USDA FoodData Central", "");
  lines.push(`Run ${new Date().toISOString().slice(0, 10)}. Compared ${results.length} foods (${confident.length} with a confident name match); skipped ${skipped.length}.`, "");
  lines.push("Error = |built-in − USDA| ÷ USDA, with small floors (20 kcal, 2 g protein/fat/carbs, 1 g sat fat/fiber/sugar, 50 mg sodium) so tiny amounts don't dominate. USDA values are per 100 g, scaled to each serving's grams. Raw-vs-cooked and branded-vs-generic differences add error, so review the worst rows before changing data.", "");
  lines.push("## Accuracy by nutrient (confident matches)", "", "| Nutrient | Median error | Within 10% | Within 25% |", "| --- | --- | --- | --- |");
  for (const [k, , label] of COMPARED) {
    const e = confident.map(r => r.errors[k]);
    lines.push(`| ${label} | ${pctf(median(e))} | ${pctf(e.filter(x => x <= 0.1).length / e.length)} | ${pctf(e.filter(x => x <= 0.25).length / e.length)} |`);
  }
  const agree = confident.filter(r => r.verdictBuilt === r.verdictUsda);
  lines.push("", "## Verdict agreement", "", `${agree.length} of ${confident.length} confident matches (${pctf(agree.length / confident.length)}) get the same verdict with USDA's numbers.`, "");
  const flips = confident.filter(r => r.verdictBuilt !== r.verdictUsda);
  if (flips.length) {
    lines.push("| Food | Built-in verdict | With USDA numbers | USDA record |", "| --- | --- | --- | --- |");
    for (const r of flips) lines.push(`| ${r.name} | ${r.verdictBuilt} | ${r.verdictUsda} | ${r.usdaName} (${r.fdcId}) |`);
  }
  lines.push("", "## Largest differences (confident matches)", "", "| Food | Worst nutrient | Built-in | USDA | USDA record |", "| --- | --- | --- | --- | --- |");
  for (const r of [...confident].sort((a, b) => b.maxError - a.maxError).slice(0, 25)) {
    const [k, , label] = COMPARED.reduce((w, c) => (r.errors[c[0]] > r.errors[w[0]] ? c : w));
    lines.push(`| ${r.name} | ${label} (${pctf(r.errors[k])}) | ${r.built[k]} | ${r.usda[k]} | ${r.usdaName} (${r.fdcId}) |`);
  }
  const weak = results.filter(r => r.confidence < 0.5);
  if (weak.length) {
    lines.push("", "## Uncertain name matches (excluded above)", "", "Pin the right record in eval/usda-map.json and rerun.", "", "| Food | Top USDA result |", "| --- | --- |");
    for (const r of weak) lines.push(`| ${r.name} | ${r.usdaName} (${r.fdcId}) |`);
  }
  if (skipped.length) lines.push("", "## Skipped", "", skipped.map(s => `- ${s.name}: ${s.reason}`).join("\n"));
  return lines.join("\n") + "\n";
}

async function main() {
  const key = process.env.USDA_API_KEY;
  if (!key) { console.error("Set USDA_API_KEY (free at https://fdc.nal.usda.gov/api-key-signup.html). The demo key's rate limit is too low for a full run."); process.exit(1); }
  const mapFile = path.join(HERE, "usda-map.json");
  const pinned = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, "utf8")) : {};
  const only = process.argv[2] ? new RegExp(process.argv[2], "i") : null;
  const results = [], skipped = [];
  for (const f of FOODS) {
    if (only && !only.test(f.n)) continue;
    if (!servingGrams(f.s)) { skipped.push({ name: f.n, reason: "serving has no gram weight" }); continue; }
    try {
      let item;
      if (pinned[f.n]) {
        const res = await fetch(`https://api.nal.usda.gov/fdc/v1/food/${pinned[f.n]}?api_key=${encodeURIComponent(key)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        item = await res.json();
      } else {
        const query = f.n.replace(/\(.*?\)/g, "").replace(/,/g, " ");
        const res = await fetch(S.usdaSearchUrl(query, key).replace("pageSize=8", "pageSize=3"));
        if (res.status === 429) throw new Error("rate limited");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        item = ((await res.json()).foods || [])[0];
      }
      if (!item) { skipped.push({ name: f.n, reason: "no USDA result" }); continue; }
      const r = compareFood(f, S.fromUsda(item));
      if (r) results.push(r);
      process.stdout.write(".");
    } catch (e) {
      skipped.push({ name: f.n, reason: e.message });
      if (/rate limited/.test(e.message)) break;
    }
    await new Promise(r => setTimeout(r, 120));
  }
  process.stdout.write("\n");
  const report = buildReport(results, skipped);
  fs.writeFileSync(path.join(HERE, "report.md"), report);
  fs.writeFileSync(path.join(HERE, "results.json"), JSON.stringify({ results, skipped }, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report.split("\n").slice(0, 20).join("\n"));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
