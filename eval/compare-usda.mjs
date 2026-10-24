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

// ---- name matching ----
// Plural-insensitive tokens, without filler words.
const STOP = new Set(["and", "the", "for", "nfs", "not", "further", "specified", "includes", "all", "type", "types", "style"]);
const stem = w => w.replace(/ies$/, "y").replace(/ie$/, "y").replace(/(ch|sh|x|o)es$/, "$1").replace(/s$/, "");
export const tokens = s => String(s).toLowerCase().replace(/flour tortilla/g, "tortilla").split(/[^a-z]+/).filter(w => w.length > 2 && !STOP.has(w)).map(stem);
// Words that make a different food when the built-in name doesn't have them ("Broccoli" vs "Fried broccoli").
const CHANGERS = new Set(["fried", "creamed", "cream", "casserole", "bread", "dip", "salad", "pickled", "nectar", "powder", "dehydrated",
  "oil", "juice", "soup", "sauce", "cake", "pie", "cookie", "sandwich", "bit", "chip", "stick", "battered", "breaded", "dried", "canned",
  "frozen", "sweetened", "smoothie", "muffin", "stuffed", "babyfood", "baby", "puree", "flavored", "chocolate", "syrup", "jam",
  "concentrate", "added", "glazed", "candied", "alcoholic", "beer", "infant", "formula", "toddler", "pudding", "dessert", "fritter",
  "dumpling", "spread", "mix", "dressing", "gravy", "stew", "omelet", "scrambled", "with", "made", "imitation", "substitute",
  "curry", "cocktail", "butter", "pastry", "vodka", "palm", "lomi", "crumb", "nugget",
  "glutinous", "seeded", "chanterelle", "rose", "leather"].map(stem));
// Other foods' names: a USDA description that names a food the built-in name doesn't ("Tomatoes, grape" for "Grapes",
// "Cheese, ricotta, whole milk" for "Whole milk") is a different food. Built from the app's own food names,
// minus words that only describe a food.
const MODIFIERS = new Set(["raw", "cooked", "white", "whole", "red", "green", "black", "yellow", "brown", "plain", "low", "fat", "light", "regular",
  "sweet", "fresh", "large", "small", "medium", "mixed", "baked", "grilled", "roasted", "boneless", "skinless", "lean", "extra", "reduced",
  "sodium", "free", "nonfat", "unsweetened", "original", "classic", "store", "restaurant", "fast", "food", "bottled", "instant", "refrigerated",
  "ready", "drink", "style", "half", "part", "skim", "grade", "virgin", "pure", "zero", "diet", "hard", "soft", "dark", "deli", "sliced",
  "shredded", "grated", "ground", "fried", "breakfast", "spread", "juice", "sauce", "oil", "cream", "milk", "chicken", "beef", "pork", "turkey",
  // USDA category words and common descriptors ("Fish, salmon", "Cheese, brie", "Cereal, bran flakes")
  "fish", "cheese", "dry", "meat", "salt", "from", "cereal", "nut", "snack", "snap", "cabbage", "potato", "rotisserie", "seed", "grain", "based",
  "wheat", "california", "squash", "new", "firm", "flake", "french", "pearled", "english", "calorie", "fruit", "corn", "tea", "vegetable", "pasta",
  "sweetener", "bar", "beverage", "bean", "cookie", "onion", "egg", "spaghetti", "salsa", "tortilla", "sugar", "cinnamon", "bun", "brisket",
  "italian", "vanilla", "tofu", "soup", "dip", "bread", "roll", "pizza", "taco", "sandwich", "salad"].map(stem));
const FOOD_WORDS = new Set(FOODS.flatMap(f => tokens(f.n)).filter(w => !MODIFIERS.has(w)));
FOOD_WORDS.add(stem("bagel")); FOOD_WORDS.add(stem("whiskey")); FOOD_WORDS.add(stem("vinegar")); FOOD_WORDS.add(stem("stuffing"));
FOOD_WORDS.add(stem("flour")); FOOD_WORDS.add(stem("peel")); FOOD_WORDS.add(stem("bison")); FOOD_WORDS.add(stem("game")); FOOD_WORDS.add(stem("condensed"));
// A flavored or sweetened food matched to a plain or unsweetened record (or the reverse) is a different food.
const FLAVORED = /\b(flavored|sweetened|vanilla|chocolate|honey)\b/i, PLAIN = /\b(plain|unsweetened)\b/i;
const COOKED = /\b(cooked|baked|boiled|grilled|roasted|steamed|braised|broiled|fried|microwaved)\b/i;

// How sure we are that a USDA description is the same food: share of the built-in name's words it covers,
// minus a large penalty per changing word the built-in name lacks and a small one per other extra word.
export function matchDebug(name, description) {
  const want = new Set(tokens(name));
  return [...new Set(tokens(description).filter(w => !want.has(w) && (CHANGERS.has(w) || FOOD_WORDS.has(w))))];
}
export function matchConfidence(name, description) {
  const want = tokens(name), have = tokens(description);
  if (!want.length) return 0;
  const haveSet = new Set(have), wantSet = new Set(want);
  const coverage = want.filter(w => haveSet.has(w)).length / want.length;
  const extras = [...new Set(have.filter(w => !wantSet.has(w)))];
  let changers = extras.filter(w => CHANGERS.has(w) || FOOD_WORDS.has(w)).length;
  if ((FLAVORED.test(name) && PLAIN.test(description) && !PLAIN.test(name)) || (PLAIN.test(name) && FLAVORED.test(description) && !FLAVORED.test(name))) changers += 1;
  const others = Math.min(0.15, 0.03 * (extras.length - changers));
  // Squared coverage: missing one of three words ("artichoke hearts" vs "hearts of palm") costs more than linearly.
  return Math.max(0, Math.round((coverage ** 2 - 0.6 * changers - others) * 100) / 100);
}

// Ranking among candidates: confidence first, then basic data types and a raw/cooked state that matches the serving.
export function rankCandidates(food, candidates) {
  const ours = `${food.n} ${food.s}`;
  const cooked = COOKED.test(ours);
  const produce = food.c === "fruit" || food.c === "veg";
  return candidates.map(item => {
    const desc = String(item.description || "");
    const confidence = matchConfidence(food.n, desc);
    let score = confidence;
    if (item.dataType === "Foundation") score += 0.08; else if (item.dataType === "SR Legacy") score += 0.06;
    const raw = /\braw\b/i.test(desc);
    if (!cooked && raw && (produce || /\braw\b/i.test(ours))) score += 0.1;
    if (cooked && (raw || /\b(dry|unprepared|uncooked|condensed)\b/i.test(desc))) score -= 0.3;
    if (cooked) { const w = ours.match(COOKED)[1].toLowerCase(); if (new RegExp(`\\b${w}\\b`, "i").test(desc)) score += 0.1; }
    return { item, confidence, score };
  }).sort((a, b) => b.score - a.score);
}

// Compare one built-in food with one USDA record (per 100 g).
export function compareFood(f, usdaFood) {
  const grams = servingGrams(f.s);
  if (!grams) return null;
  const u = V.scale(usdaFood, grams / 100);
  const missing = new Set(usdaFood.missing || []);
  // Nutrients the USDA record doesn't report are unknown, not zero: they're left out of the error and the verdict uses ours.
  const errors = {};
  for (const [k, floor] of COMPARED) errors[k] = missing.has(k) ? null : Math.abs(f[k] - u[k]) / Math.max(u[k], floor);
  // For the verdict, use USDA's numbers where it has them; USDA rarely reports added sugar, so keep ours.
  const asUsda = { ...f };
  for (const [k] of COMPARED) if (!missing.has(k)) asUsda[k] = u[k];
  if (u.trans > 0) asUsda.trans = u.trans;
  if (u.chol > 0) asUsda.chol = u.chol;
  asUsda.add = Math.min(f.add, asUsda.sug);
  const p = { ...V.DEFAULT_PROFILE };
  return {
    name: f.n, serving: f.s, grams, usdaName: usdaFood.n, fdcId: usdaFood.fdcId,
    confidence: matchConfidence(f.n, usdaFood.n),
    built: Object.fromEntries(COMPARED.map(([k]) => [k, f[k]])),
    usda: Object.fromEntries(COMPARED.map(([k]) => [k, missing.has(k) ? null : Math.round(u[k] * 10) / 10])),
    dataType: usdaFood.dataType, missing: [...missing],
    errors, maxError: Math.max(0, ...Object.values(errors).filter(e => e != null)),
    verdictBuilt: V.assess(f, p).word, verdictUsda: V.assess(asUsda, p).word,
  };
}

export function loadPinned() {
  const mapFile = path.join(HERE, "usda-map.json");
  return fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, "utf8")) : {};
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
// USDA's API rejects some requests intermittently (HTTP 400/5xx under load), so retry with backoff.
async function usdaFetch(url, init) {
  let last;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt) await sleep(500 * 2 ** (attempt - 1));
    const res = await fetch(url, init);
    if (res.ok) return res.json();
    last = `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 120).replace(/\s+/g, " ")}`;
    if (res.status === 403 || res.status === 404) break;
  }
  throw new Error(/HTTP 429/.test(last) ? "rate limited" : last);
}

export async function searchUsda(query, key, pageSize = 25) {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}`;
  const body = { query, dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"], pageSize };
  try {
    return (await usdaFetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).foods || [];
  } catch (e) {
    if (/rate limited/.test(e.message)) throw e;
    const get = S.usdaSearchUrl(query, key).replace("pageSize=8", `pageSize=${pageSize}`);
    return (await usdaFetch(get)).foods || [];
  }
}

// The USDA record for a built-in food: the pinned fdcId from eval/usda-map.json if any, else the best-ranked search result.
export async function fetchUsda(food, key, pinned = {}) {
  if (pinned[food.n]) return usdaFetch(`https://api.nal.usda.gov/fdc/v1/food/${pinned[food.n]}?api_key=${encodeURIComponent(key)}`);
  const query = food.n.replace(/\(.*?\)/g, "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const ranked = rankCandidates(food, await searchUsda(query, key));
  return ranked.length ? ranked[0].item : null;
}

// Confident matches that are far off, with USDA's numbers scaled to the serving, for a person to review and apply.
export function suggestions(results, threshold = 0.25) {
  return results.filter(r => r.confidence >= 0.5 && r.maxError > threshold)
    .sort((a, b) => b.maxError - a.maxError)
    .map(r => ({ name: r.name, serving: r.serving, grams: r.grams, usdaRecord: `${r.usdaName} (${r.fdcId})`, maxError: Math.round(r.maxError * 100) / 100, current: r.built, usda: r.usda }));
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
    const e = confident.map(r => r.errors[k]).filter(x => x != null);
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
    const [k, , label] = COMPARED.reduce((w, c) => ((r.errors[c[0]] ?? -1) > (r.errors[w[0]] ?? -1) ? c : w));
    lines.push(`| ${r.name} | ${label} (${pctf(r.errors[k])}) | ${r.built[k]} | ${r.usda[k]} | ${r.usdaName} (${r.fdcId}) |`);
  }
  const weak = results.filter(r => r.confidence < 0.5);
  if (weak.length) {
    lines.push("", "## Uncertain name matches (excluded above)", "", "Pin the right record in eval/usda-map.json and rerun.", "", "| Food | Top USDA result |", "| --- | --- |");
    for (const r of weak) lines.push(`| ${r.name} | ${r.usdaName} (${r.fdcId}) |`);
  }
  const fix = results.filter(r => r.confidence >= 0.5 && r.maxError > 0.25).length;
  lines.push("", "## Next step", "", `${fix} confident matches differ by more than 25% on at least one nutrient. Their USDA numbers, scaled to each serving, are in eval/suggested-values.json. Review each one (raw vs cooked, brand vs generic) before updating js/foods.js, then run \`npm run snapshot\` and review the verdict changes.`);
  if (skipped.length) lines.push("", "## Skipped", "", skipped.map(s => `- ${s.name}: ${s.reason}`).join("\n"));
  return lines.join("\n") + "\n";
}

async function main() {
  const key = process.env.USDA_API_KEY;
  if (!key) { console.error("Set USDA_API_KEY (free at https://fdc.nal.usda.gov/api-key-signup.html). The demo key's rate limit is too low for a full run."); process.exit(1); }
  const pinned = loadPinned();
  const only = process.argv[2] ? new RegExp(process.argv[2], "i") : null;
  const results = [], skipped = [];
  for (const f of FOODS) {
    if (only && !only.test(f.n)) continue;
    if (!servingGrams(f.s)) { skipped.push({ name: f.n, reason: "serving has no gram weight" }); continue; }
    try {
      const item = await fetchUsda(f, key, pinned);
      if (!item) { skipped.push({ name: f.n, reason: "no USDA result" }); continue; }
      const r = compareFood(f, S.fromUsda(item));
      if (r) results.push(r);
      process.stdout.write(".");
    } catch (e) {
      skipped.push({ name: f.n, reason: e.message });
      if (/rate limited/.test(e.message)) break;
    }
    await sleep(250);
  }
  process.stdout.write("\n");
  const report = buildReport(results, skipped);
  fs.writeFileSync(path.join(HERE, "report.md"), report);
  fs.writeFileSync(path.join(HERE, "results.json"), JSON.stringify({ results, skipped }, null, 2));
  const sugg = suggestions(results);
  fs.writeFileSync(path.join(HERE, "suggested-values.json"), JSON.stringify(sugg, null, 2) + "\n");
  console.log(`${sugg.length} foods differ from USDA by more than 25%; review eval/suggested-values.json before changing js/foods.js.`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report.split("\n").slice(0, 20).join("\n"));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
